import {
    Injectable,
    Inject,
    FileSystem,
    EnvConfig,
    FileSystemDriver,
    ProcessService,
    FILE_SYSTEM_DRIVER_KEY
} from "@wocker/core";
import type Docker from "dockerode";
import type {ImageInfo} from "dockerode";
import DockerIgnore from "@balena/dockerignore";
import tar, {Pack} from "tar-stream";
import {Readable} from "stream";
import {pipeline} from "stream/promises";
import zlib from "zlib";
import {ModemService} from "./ModemService";


@Injectable("DOCKER_IMAGE_SERVICE")
export class ImageService {
    public constructor(
        protected readonly processService: ProcessService,
        protected readonly modemService: ModemService,
        @Inject(FILE_SYSTEM_DRIVER_KEY)
        protected readonly driver: FileSystemDriver
    ) {}

    public get docker(): Docker {
        return this.modemService.docker;
    }

    public async list(options?: ImageService.ListOptions): Promise<ImageInfo[]> {
        const {
            tag,
            reference,
            labels
        } = options || {};

        const filters: any = {};

        if(reference) {
            filters.reference = [
                ...filters.reference || [],
                ...reference
            ];
        }

        if(tag) {
            filters.reference = [
                ...filters.reference || [],
                tag
            ];
        }

        if(labels) {
            filters.label = [];

            for(const i in labels) {
                filters.label.push(`${i}=${labels[i]}`);
            }
        }

        return this.docker.listImages({
            filters: JSON.stringify(filters)
        });
    }

    public async build(params: ImageService.BuildOptions): Promise<void> {
        const {
            version,
            tag,
            labels,
            buildArgs
        } = params;

        const dockerfile = "dockerfile" in params
            ? params.dockerfile
            : params.src;

        const contexts = Array.isArray(params.context)
            ? ([...params.context]).reverse()
            : [params.context];

        const pack = tar.pack({});

        const createPackV3 = async (pack: Pack, contexts: string[]) => {
            const packPaths = new Set();

            const packDir = async (fs: FileSystem, filter: (path: string) => boolean, dirPath: string) => {
                const paths = fs.readdir(dirPath);

                for(const path of paths) {
                    const fullPath = dirPath ? `${dirPath}/${path}` : path;

                    const stat = fs.stat(fullPath);

                    if((packPaths.has(fullPath) || !filter(fullPath)) && !stat.isDirectory()) {
                        continue;
                    }

                    packPaths.add(fullPath);

                    if(stat.isDirectory()) {
                        pack.entry({
                            type: "directory",
                            name: `./${fullPath}/`,
                            size: 0,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid,
                            mode: stat.mode
                        });

                        await packDir(fs, filter, fullPath);
                    }
                    else if(stat.isFile()) {
                        const entry = pack.entry({
                            type: "file",
                            name: `./${fullPath}`,
                            size: stat.size,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid,
                            mode: stat.mode
                        });

                        await pipeline(fs.createReadStream(fullPath), entry);
                    }
                    else if(stat.isSymbolicLink()) {
                        pack.entry({
                            type: "symlink",
                            name: `./${fullPath}`,
                            linkname: fs.readlink(fullPath),
                            size: 0,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid,
                            mode: stat.mode
                        });
                    }
                }
            };

            for(const context of contexts) {
                const fs = new FileSystem(context, this.driver);

                const filter = fs.exists(".dockerignore")
                    ? DockerIgnore({ignorecase: false})
                        .add(fs.readFile(".dockerignore").toString())
                        .createFilter()
                    : () => true;

                await packDir(fs, filter, "");
            }
        };

        let build: Readable = pack;

        createPackV3(pack, contexts).then(() => {
            pack.finalize();
        });

        const variant: "tar" | "tar.gz" = "tar" as "tar" | "tar.gz";

        if(variant === "tar.gz") {
            build = pack.pipe(zlib.createGzip());
        }

        const resolvedBuildArgs = Object.keys(buildArgs || {}).reduce<EnvConfig>((res, key) => {
            if(!buildArgs) {
                return res;
            }

            const value = buildArgs[key];

            if(typeof value !== "undefined") {
                // noinspection SuspiciousTypeOfGuard
                res[key] = typeof value !== "string" ? (value as any).toString() : value;
            }

            return res;
        }, {});

        const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
            this.docker.modem.dial({
                path: "/build?",
                method: "POST",
                file: build,
                options: {
                    version,
                    t: tag,
                    labels,
                    buildargs: resolvedBuildArgs,
                    rm: true,
                    dockerfile
                },
                headers: {
                    "Connection": "close"
                },
                isStream: true,
                statusCodes: {
                    200: true,
                    500: "server error"
                }
            }, (err, data) => {
                if(err) {
                     reject(err);
                     return;
                }

                resolve(data as NodeJS.ReadableStream);
            });
        });

        await this.modemService.followProgress(stream);
    }

    public async exists(tag: string): Promise<boolean> {
        const image = this.docker.getImage(tag);

        try {
            await image.inspect();

            return true;
        }
        catch(err) {
            return false;
        }
    }

    public async pull(tag: string): Promise<void> {
        if(await this.exists(tag)) {
            return;
        }

        const stream = await this.docker.pull(tag);

        await this.modemService.followProgress(stream);
    }

    public async rm(tag: string, force: boolean = false): Promise<void> {
        if(!await this.exists(tag)) {
            return;
        }

        const image = this.docker.getImage(tag);

        await image.remove({
            force
        });
    }
}

export namespace ImageService {
    export type ListOptions = {
        tag?: string;
        reference?: string[];
        labels?: {
            [key: string]: string;
        };
    };

    export type BuildOptions = {
        version?: "1" | "2";
        tag: string;
        buildArgs?: {
            [key: string]: string;
        };
        labels?: {
            [key: string]: string;
        };
        context: string | string[];
    } & ({
        /** @deprecated */
        src: string;
    } | {
        dockerfile: string;
    });
}
