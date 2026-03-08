import {
    Injectable,
    LogService,
    ContainerService as CoreService
} from "@wocker/core";
import {Duplex} from "stream";
import type Docker from "dockerode";
import type {Container, ContainerInfo} from "dockerode";
import {ModemService} from "./ModemService";
import {ImageService} from "./ImageService";


@Injectable("DOCKER_CONTAINER_SERVICE")
export class ContainerService extends CoreService {
    public constructor(
        protected readonly modemService: ModemService,
        protected readonly imageService: ImageService,
        protected readonly logService: LogService
    ) {
        super();
    }

    public get docker(): Docker {
        return this.modemService.docker;
    }

    public async create(params: CoreService.CreateParams): Promise<Container> {
        const {
            name,
            labels,
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
                ...projectId ? {projectId} : {},
                ...labels || {}
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
                }, {}),
                ConsoleSize: [
                    process.stdout.rows,
                    process.stdout.columns
                ]
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

    public async get(name: string | string[]): Promise<Container | null> {
        const containers = await this.list({
            all: true,
            name
        });

        const names = Array.isArray(name) ? name : [name];

        for(const n of names) {
            const info = containers.find((c) => c.Names.includes(`/${n}`));

            if(info) {
                return this.docker.getContainer(info.Id);
            }
        }

        return null;
    }

    public async list(options: CoreService.ListParams = {}): Promise<ContainerInfo[]> {
        const {
            all,
            name
        } = options;

        const filters: any = {};

        if(name) {
            filters.name = Array.isArray(name) ? name : [name]
        }

        return this.docker.listContainers({
            all,
            filters
        });
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

    public async exec(
        nameOrContainer: string | Container,
        options: CoreService.ExecParams,
        _tty?: boolean
    ): Promise<Duplex | null> {
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
        } = Array.isArray(options) ? {cmd: options, tty: _tty} : options;

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

    public async logs(nameOrContainer: string | Container, params: CoreService.LogsParams = {}): Promise<NodeJS.ReadableStream | null> {
        const container: Container | null = typeof nameOrContainer === "string"
            ? await this.get(nameOrContainer)
            : nameOrContainer;

        const {
            signal
        } = params || {};

        if(!container) {
            return null;
        }

        const stream = await container.logs({
            abortSignal: signal,
            stdout: true,
            stderr: true,
            follow: true,
            tail: 4
        });

        stream.on("data", (data: Buffer) => {
            process.stdout.write(data);
        });

        stream.on("error", (err: Error) => {
            if(err.message === "aborted") {
                return;
            }

            process.stderr.write(err.message);
        });

        return stream;
    }
}
