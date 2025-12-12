import {IncomingMessage} from "http";
import {Duplex, Readable} from "stream";
import {Logger} from "@kearisp/cli";
import {Request, Response, Router} from "../router";
import {Fixtures} from "./Fixtures";
import {HttpMethod} from "../types/HttpMethod";
import {Container} from "../types/Container";
import {Image} from "../types/Image";


export class DockerStorage {
    protected containers: Container[] = [];
    protected images: Image[] = [];
    protected fixtures: Fixtures[] = [];
    protected router: Router;

    public constructor() {
        this.router = new Router();

        this.router.post(["/session", "/:version/session"], (_req: Request, res: Response): void => {
            const duplex = new Duplex();

            res.send(duplex);
        });

        this.router.get(["/containers/json", "/:version/containers/json"], (req: Request, res: Response): void => {
            res.status(200).send(this.listContainers(req.body));
        });

        this.router.post(["/containers/create", "/:version/containers/create"], (req: Request, res: Response): void => {
            const id = this.createContainer(req.body);

            res.status(201).send({
                Id: id
            });
        });

        this.router.get(["/containers/:id/json", "/:version/containers/:id/json"], (req: Request, res: Response): void => {
            const inspect = this.containerInspect(req.params.id);

            if(!inspect) {
                throw new Error("Not found");
            }

            res.status(200).send(inspect);
        });

        this.router.post(["/containers/:id/start", "/:version/containers/:id/start"], (req: Request, res: Response): void => {
            this.run(req.params.id);

            res.send(Buffer.from([]));
        });

        this.router.get(["/images/json", "/:version/images/json"], (req: Request, res: Response): void => {
            res.status(200).send(this.imageList(req.body));
        });

        this.router.get(["/images/:tag/json", "/:version/images/:tag/json"], (req: Request, res: Response): void => {
            const inspect = this.imageInspect(req.params.tag);

            if(!inspect) {
                throw new Error("Image not found");
            }

            res.status(200).send(inspect);
        });

        this.router.delete(["/images/:tag", "/:version/images/:tag"], (req: Request, res: Response): void => {
            res.status(200).send(this.imageDelete(req.params.tag));
        });

        this.router.post(["/images/create", "/:version/images/create"], (req: Request, res: Response): void => {
            const {
                params: {
                    version = "v1"
                },
                body: {
                    fromImage,
                    tag
                }
            } = req;

            const stream = this.imagePull(version, fromImage, tag);

            if(stream) {
                res.status(200).send(stream);
            }
            else {
                throw new Error(`Not image "${fromImage}:${tag}" found`);
            }
        });

        this.router.post(["/build", "/:version/build"], (req: Request, res: Response): void => {
            const {
                params: {
                    version = "v1"
                },
                body
            } = req;

            res.status(200).send(this.build(version, body));
        });
    }

    public listContainers(body: any): any[] {
        const {
            all,
            filters: {
                name
            } = {}
        } = body;

        return this.containers.filter((container) => {
            if(all) {
                return true;
            }

            if(name && container.Name === `/${name}`) {

            }

            return container.State.Running;
        }).map((container) => {
            return {
                Id: container.Id,
                Names: [container.Name],
                Image: container.Image,
                ImageID: "",
                Created: container.Created,
                State: container.State.Status,
                Status: "Up 1 seconds",
                Ports: []
            };
        });
    }

    public createContainer(info: any): string {
        const container = {
            Id: this.generateId(),
            Name: `/${info.name}`,
            Image: info.Image,
            State: {
                Running: false,
                Dead: false,
                Status: "created",
                Error: ""
            },
            Created: new Date().getTime() / 1000,
        };

        this.containers.push(container);

        return container.Id;
    }

    public run(id: string) {
        const container = this.containers.find((container) => container.Id === id);

        if(!container) {
            throw new Error(`No such container: ${id}`);
        }

        container.State.Running = true;
        container.State.Status = "running";
    }

    public containerInspect(id: string) {
        const container = this.containers.find((container) => container.Id === id);

        if(!container) {
            throw new Error(`No such container: ${id}`);
        }

        return {
            Id: container.Id,
            Name: container.Name,
            Created: "2025-05-13T19:52:40.68081109Z",
            Path: "/usr/local/bin/docker-entrypoint.sh",
            Args: ["/usr/local/bin/bun"],
            State: {
                Status: container.State.Status,
                Running: container.State.Running,
                Paused: false,
                Restarting: false,
                OOMKilled: false,
                Dead: false,
                Pid: 0,
                ExitCode: 0,
                Error: "",
                StartedAt: "0001-01-01T00:00:00Z",
                FinishedAt: "0001-01-01T00:00:00Z"
            },
            Image: "sha256:3476c857e7c05a7950b3a8a684ffbc82f5cbeffe1b523ea1a92bdefc4539dc57",
            ResolvConfPath: "",
            HostnamePath: "",
            HostsPath: "",
            LogPath: "",
            RestartCount: 0,
            Driver: "overlayfs",
            Platform: "linux",
            MountLabel: "",
            ProcessLabel: "",
            AppArmorProfile: "",
            ExecIDs: null,
            HostConfig: {
                Binds: null,
                ContainerIDFile: "",
                LogConfig: {
                    Type: "json-file",
                    Config: {}
                },
                NetworkMode: "bridge",
                PortBindings: {},
                RestartPolicy: {
                    Name: "no",
                    MaximumRetryCount: 0
                },
                AutoRemove:false,
                VolumeDriver: "",
                VolumesFrom: null,
                ConsoleSize: [0,0],
                CapAdd: null,
                CapDrop: null,
                CgroupnsMode: "host",
                Dns:null,
                DnsOptions: null,
                DnsSearch: null,
                ExtraHosts: null,
                GroupAdd: null,
                IpcMode: "private",
                Cgroup: "",
                Links: null,
                OomScoreAdj: 0,
                PidMode: "",
                Privileged: false,
                PublishAllPorts: false,
                ReadonlyRootfs: false,
                SecurityOpt: null,
                UTSMode: "",
                UsernsMode: "",
                ShmSize: 67108864,
                Runtime: "runc",
                Isolation: "",
                CpuShares: 0,
                Memory: 0,
                NanoCpus: 0,
                CgroupParent: "",
                BlkioWeight: 0,
                BlkioWeightDevice: null,
                BlkioDeviceReadBps: null,
                BlkioDeviceWriteBps: null,
                BlkioDeviceReadIOps: null,
                BlkioDeviceWriteIOps: null,
                CpuPeriod: 0,
                CpuQuota: 0,
                CpuRealtimePeriod: 0,
                CpuRealtimeRuntime: 0,
                CpusetCpus: "",
                CpusetMems: "",
                Devices: null,
                DeviceCgroupRules: null,
                DeviceRequests: null,
                MemoryReservation:0,
                MemorySwap: 0,
                MemorySwappiness: null,
                OomKillDisable: false,
                PidsLimit: null,
                Ulimits: null,
                CpuCount: 0,
                CpuPercent: 0,
                IOMaximumIOps: 0,
                IOMaximumBandwidth: 0,
                MaskedPaths: [
                    "/proc/asound", "/proc/acpi", "/proc/kcore", "/proc/keys", "/proc/latency_stats",
                    "/proc/timer_list", "/proc/timer_stats", "/proc/sched_debug", "/proc/scsi",
                    "/sys/firmware", "/sys/devices/virtual/powercap"
                ],
                ReadonlyPaths: [
                    "/proc/bus", "/proc/fs", "/proc/irq", "/proc/sys", "/proc/sysrq-trigger"
                ]
            },
            GraphDriver: {
                Data: null,
                Name: "overlayfs"
            },
            Mounts: [],
            Config: {
                Hostname: "36a07d831a95",
                Domainname: "",
                User: "",
                AttachStdin: false,
                AttachStdout: false,
                AttachStderr: false,
                Tty: false,
                OpenStdin: false,
                StdinOnce: false,
                Env: [
                    "PATH=/usr/local/sbin:/usr/local/b in:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin",
                    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=0",
                    "BUN_INSTALL_BIN=/usr/local/bin"
                ],
                Cmd: [
                    "/usr/local/bin/bun"
                ],
                Image: "oven/bun:alpine",
                Volumes: null,
                WorkingDir: "/home/bun/app",
                Entrypoint: [
                    "/usr/local/bin/docker-entrypoint.sh"
                ],
                OnBuild: null,
                Labels: {
                    "desktop.docker.io/wsl-distro":"Ubuntu",
                    "org.opencontainers.image.created": "2025-05-10T14:05:09.084Z",
                    "org.opencontainers.image.description":"Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one",
                    "org.opencontainers.image.licenses":"NOASSERTION",
                    "org.opencontainers.image.revision":"64ed68c9e0faa7f5224876be8681d2bdc311454b",
                    "org.opencontainers.image.source": "https://github.com/oven-sh/bun",
                    "org.opencontainers.image.title":"bun",
                    "org.opencontainers.image.url": "https://github.com/oven-sh/bun",
                    "org.opencontainers.image.version":"1.2.13-alpine"
                }
            },
            NetworkSettings: {
                Bridge: "",
                SandboxID: "",
                SandboxKey: "",
                Ports: {},
                HairpinMode: false,
                LinkLocalIPv6Address: "",
                LinkLocalIPv6PrefixLen: 0,
                SecondaryIPAddresses: null,
                SecondaryIPv6Addresses: null,
                EndpointID: "",
                Gateway: "",
                GlobalIPv6Address: "",
                GlobalIPv6PrefixLen: 0,
                IPAddress: "",
                IPPrefixLen: 0,
                IPv6Gateway: "",
                MacAddress: "",
                Networks: {
                    bridge: {
                        IPAMConfig: null,
                        Links: null,
                        Aliases: null,
                        MacAddress: "",
                        DriverOpts: null,
                        GwPriority: 0,
                        NetworkID: "",
                        EndpointID: "",
                        Gateway: "",
                        IPAddress: "",
                        IPPrefixLen: 0,
                        IPv6Gateway: "",
                        GlobalIPv6Address: "",
                        GlobalIPv6PrefixLen: 0,
                        DNSNames: null
                    }
                }
            },
            ImageManifestDescriptor: {
                mediaType: "application/vnd.oci.image.manifest.v1+json",
                digest: "sha256:2cdc992a4322a4f82e07435700d22687a5f2101cbbbe2e4f9956eb490b07675b",
                size: 1430,
                platform: {
                    architecture: "amd64",
                    os: "linux"
                }
            }
        };
    }

    public imageList(body: any) {
        if(Object.keys(body).length > 0) {
            // TODO
            Logger.warn("imageList(", body, ")");
            return [];
        }

        const images = [];

        for(const image of this.images) {
            images.push({
                Containers: -1,
                Created: 1747579856,
                Id: image.Id,
                Labels: image.Labels,
                ParentId: image.ParentId,
                Descriptor: {
                    mediaType: "application/vnd.oci.image.manifest.v1+json",
                    digest: "sha256:72e58c97811826c57ab14f700f6a7cbb5147e4c8a60e84c53e5c07981bd62498",
                    size: 6461
                },
                RepoDigests: [
                    "project-lidermarket@sha256:72e58c97811826c57ab14f700f6a7cbb5147e4c8a60e84c53e5c07981bd62498"
                ],
                RepoTags: image.RepoTags,
                SharedSize: -1,
                Size: 746947017
            });
        }

        return images;
    }

    public imageInspect(tag: string) {
        const image = this.images.find((image) => {
            return image.RepoTags.includes(tag);
        });

        if(!image) {
            return null;
        }

        return {
            Id: image.Id,
            RepoTags: image.RepoTags,
            RepoDigests: [
                "oven/bun@sha256:3476c857e7c05a7950b3a8a684ffbc82f5cbeffe1b523ea1a92bdefc4539dc57"
            ],
            Parent: "",
            Comment: "buildkit.dockerfile.v0",
            Created: "2025-05-10T14:05:18.376365783Z",
            DockerVersion: "",
            Author: "",
            Config: {
                Hostname: "",
                Domainname: "",
                User: "",
                AttachStdin: false,
                AttachStdout: false,
                AttachStderr: false,
                Tty: false,
                OpenStdin: false,
                StdinOnce: false,
                Env: [
                    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin",
                    "BUN_RUNTIME_TRANSPILER_CACHE_PATH=0",
                    "BUN_INSTALL_BIN=/usr/local/bin"
                ],
                Cmd: [
                    "/usr/local/bin/bun"
                ],
                ArgsEscaped: true,
                Image: "",
                Volumes: null,
                WorkingDir: "/home/bun/app",
                Entrypoint: [
                    "/usr/local/bin/docker-entrypoint.sh"
                ],
                OnBuild: null,
                Labels: {
                    "org.opencontainers.image.created": "2025-05-10T14:05:09.084Z",
                    "org.opencontainers.image.description": "Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all inone",
                    "org.opencontainers.image.licenses": "NOASSERTION",
                    "org.opencontainers.image.revision": "64ed68c9e0faa7f5224876be8681d2bdc311454b",
                    "org.opencontainers.image.source": "https://github.com/oven-sh/bun",
                    "org.opencontainers.image.title": "bun",
                    "org.opencontainers.image.url": "https://github.com/oven-sh/bun",
                    "org.opencontainers.image.version": "1.2.13-alpine"
                }
            },
            Architecture: "amd64",
            Os: "linux",
            Size: 43424417,
            GraphDriver: {
                Data: null,
                Name: "overlayfs"
            },
            RootFS: {
                Type: "layers",
                Layers: [
                    "sha256:994456c4fd7b2b87346a81961efb4ce945a39592d32e0762b38768bca7c7d085",
                    "sha256:ef70d6692b1e80a64fc0b2e711743f8c48f3e6ee466627c41e8b20860e7f2585",
                    "sha256:d58e9e6425c6cae4632955cdfd38a4999dd9388c6634d715313daaac9597f75a",
                    "sha256:ad245466e7de8bcb67fcaeebd8b389a7d16d2b0c6f8f324991bf9cc4df245f2f",
                    "sha256:e372adeb3e6e54f548965d7606f46b59ebbbfff41adcbc82887fcc57f6f309af",
                    "sha256:93b857d12c79ea9799ac3c88b898ab836916901d160964b6e0088809af60cfe1"
                ]
            },
            Metadata: {
                LastTagTime: "2025-05-10T20:18:24.410728378Z"
            },
            Descriptor: {
                mediaType: "application/vnd.oci.image.index.v1+json",
                digest: "sha256:3476c857e7c05a7950b3a8a684ffbc82f5cbeffe1b523ea1a92bdefc4539dc57",
                size: 1609
            }
        };
    }

    public imagePull(version: string, imageName: string, tag: string): IncomingMessage | null {
        const fixture = (() => {
            for(const fixture of this.fixtures) {
                if(fixture.hasPull(version, imageName, tag)) {
                    return fixture;
                }
            }

            return null;
        })();

        if(!fixture) {
            return null;
        }

        const stream = fixture.pull(version, imageName, tag);

        stream.on("end", () => {
            const image = fixture.imageInspect(version, imageName, tag);

            if(!image) {
                return null;
            }

            this.images.push(image);
        });

        return stream as any;
    }

    public imageDelete(imageTag: string) {
        this.images = this.images
            .filter((image) => {
                return !(image.RepoTags.length === 1 && image.RepoTags.includes(imageTag));
            })
            .map((image) => {
                if(image.RepoTags.includes(imageTag)) {
                    image.RepoTags = image.RepoTags.filter((tag: string) => {
                        return tag !== imageTag;
                    });
                }

                return image;
            });

        return null;
    }

    public build(version: string, body: any): Readable {
        const {
            t: tag,
            version: builderVersion = "1"
        } = body;

        const [imageName, imageTag = "latest"] = tag.split(":");

        const fixture = this.fixtures.find((fixture) => {
            return fixture.hasBuild(version, builderVersion, imageName, imageTag);
        });

        if(!fixture) {
            throw new Error("Not found");
        }

        const stream = fixture.build(version, builderVersion, imageName, imageTag);

        Logger.info("1 >", version, builderVersion, imageName, imageTag);

        stream.on("end", (): void => {
            let image = this.images.find((image) => {
                return image.RepoTags.includes(`${imageName}:${imageTag}`);
            });

            if(!image) {
                image = fixture.imageInspect(version, imageName, imageTag);
            }

            if(image) {
                this.images.push(image);
            }
        });

        stream.on("error", (err) => {
            Logger.error(err.message);
        });

        return stream;
    }

    protected generateId(short: boolean = false): string {
        const chars = '0123456789abcdef';
        const length = short ? 12 : 64;

        let result = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * chars.length);
            result += chars[randomIndex];
        }

        return result;
    }

    protected chunkedResponse(chunks: string[]): IncomingMessage {
        const socket = {
            end: () => {}
        } as any;

        const response = new IncomingMessage(socket);

        response.statusCode = 200;
        response.statusMessage = "OK";
        response.headers = {
            "content-type": "application/json"
        };

        // let index = 0;

        // const tick = () => {
        //     if(chunks[index]) {
        //         response.push(Buffer.from(chunks[index]));
        //         index++;
        //         response.emit("readable");
        //
        //         process.nextTick(tick);
        //     }
        //     else {
        //         response.push(null);
        //     }
        // };
        //
        // process.nextTick(tick);

        for(const chunk of chunks) {
            response.push(Buffer.from(chunk));
        }

        response.push(null);

        response.emit("readable");

        return response;
    }

    public registerFixtures(fixtures: Fixtures): void {
        this.fixtures.push(fixtures);
    }

    public reset(): void {
        this.containers = [];
        this.images = [];
        this.fixtures = [];
    }

    public async exec(method: HttpMethod, path: string, body: any, options?: any): Promise<any> {
        return this.router.exec(method, path, body, options);
    }
}
