import {
    Injectable,
    LogService,
    DockerServiceParams as Params
} from "@wocker/core";
import {Duplex} from "stream";
import type Docker from "dockerode";
import type {Container} from "dockerode";
import {ModemService} from "./ModemService";
import {ImageService} from "./ImageService";


@Injectable()
export class ContainerService {
    public constructor(
        protected readonly modemService: ModemService,
        protected readonly imageService: ImageService,
        protected readonly logService: LogService
    ) {}

    public get docker(): Docker {
        return this.modemService.docker;
    }

    public async create(params: Params.CreateContainer) {
        const {
            name,
            user,
            entrypoint,
            tty = true,
            image,
            projectId,
            restart,
            memory,
            memorySwap,
            ulimits,
            extraHosts,
            networkMode = "bridge",
            links = [],
            env = {} as any,
            volumes = [],
            ports = [],
            cmd = [],
            aliases,
            network: networkName = "workspace"
        } = params;

        try {
            const network = this.docker.getNetwork(networkName);

            await network.inspect();
        }
        catch(err) {
            if((err as any).statusCode === 404) {
                await this.docker.createNetwork({
                    Name: networkName
                });
            }
        }

        await this.imageService.pull(image);

        return this.docker.createContainer({
            name,
            User: user,
            Image: image,
            Hostname: name,
            Labels: {
                ...projectId ? {projectId} : {}
            },
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            OpenStdin: true,
            StdinOnce: false,
            Entrypoint: entrypoint,
            Tty: tty,
            Cmd: cmd,
            Env: Object.keys(env).map((key) => {
                const value = env[key];

                return `${key}=${value}`;
            }),
            ExposedPorts: ports.reduce<any>((res, value) => {
                const [,, containerPort, type = "tcp"] = /(\d+):(\d+)(?:\/(\w+))?/.exec(value) || [];

                if(containerPort) {
                    res[`${containerPort}/${type}`] = {};
                }

                return res;
            }, {}),
            HostConfig: {
                Memory: memory,
                MemorySwap: memorySwap,
                NetworkMode: networkMode,
                ExtraHosts: extraHosts,
                Ulimits: ulimits ? Object.keys(ulimits).reduce<any>((res, name) => {
                    return [
                        ...res,
                        {
                            Name: name,
                            Hard: ulimits[name].hard,
                            Soft: ulimits[name].soft
                        }
                    ];
                }, []) : [],
                ...restart ? {
                    RestartPolicy: {
                        Name: restart
                    }
                } : {},
                Binds: volumes,
                PortBindings: ports.reduce<any>((res, value) => {
                    const [, hostPort, containerPort, type = "tcp"] = /(\d+):(\d+)(?:\/(\w+))?/.exec(value) || [];

                    if(hostPort && containerPort) {
                        res[`${containerPort}/${type}`] = [
                            {HostPort: hostPort}
                        ];
                    }
                    else {
                        this.logService.warn(`Invalid port format for container "${name}": "${value}". Expected format: hostPort:containerPort[/protocol]`);
                    }

                    return res;
                }, {})
            },
            NetworkingConfig: {
                EndpointsConfig: networkMode === "host" ? {} : {
                    [networkName]: {
                        Links: links,
                        Aliases: aliases || (env.VIRTUAL_HOST ? env.VIRTUAL_HOST.split(",") : undefined)
                    }
                }
            }
        });
    }

    public async get(name: string): Promise<Container|null> {
        const containers = await this.docker.listContainers({
            all: true,
            filters: {
                name: [name]
            }
        });

        const container = containers.find((container) => {
            return container.Names.indexOf("/" + name) >= 0;
        });

        if(!container) {
            return null;
        }

        return this.docker.getContainer(container.Id);
    }

    public async rm(name: string): Promise<void> {
        const container = await this.get(name);

        if(!container) {
            return;
        }

        const {
            State: {
                Status
            }
        } = await container.inspect();

        if(Status === "running" || Status === "restarting") {
            try {
                await container.stop();
            }
            catch(err) {
                this.logService.error("DockerService.removeContainer", (err as any).message);
            }
        }

        try {
            await container.remove();
        }
        catch(err) {
            this.logService.error("DockerService.removeContainer: ", (err as any).message);
        }
    }

    public async exec(nameOrContainer: string|Container, options: Params.Exec|string[], _tty?: boolean): Promise<Duplex | null> {
        const container: Container | null = typeof nameOrContainer === "string"
            ? await this.get(nameOrContainer)
            : nameOrContainer;

        if(!container) {
            return null;
        }

        const {
            cmd = [],
            tty = false,
            user
        } = Array.isArray(options) ? {
            cmd: options,
            tty: _tty
        } as Params.Exec : options;

        const exec = await container.exec({
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: tty,
            User: user,
            Cmd: cmd,
            ConsoleSize: [
                process.stdout.rows,
                process.stdout.columns
            ]
        });

        const stream = await exec.start({
            hijack: true,
            stdin: tty,
            Tty: tty
        });

        if(tty) {
            const handleResize = async (): Promise<void> => {
                const [width, height] = process.stdout.getWindowSize();

                this.logService.debug("Exec resize", {
                    width,
                    height
                });

                await exec.resize({
                    w: width,
                    h: height
                });
            };

            process.on("SIGWINCH", handleResize);

            try {
                await this.modemService.attachStream(stream);
            }
            finally {
                process.off("SIGWINCH", handleResize);
            }
        }

        return stream;
    }
}
