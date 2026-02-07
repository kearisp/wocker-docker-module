import {
    Injectable,
    Inject,
    FileSystem,
    EnvConfig,
    FileSystemDriver,
    FILE_SYSTEM_DRIVER_KEY
} from "@wocker/core";
import type Docker from "dockerode";
import type {ImageInfo} from "dockerode";
import DockerIgnore from "@balena/dockerignore";
import tar from "tar-stream";
import zlib from "zlib";
import {ModemService} from "./ModemService";


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

@Injectable("DOCKER_IMAGE_SERVICE")
export class ImageService {
    public constructor(
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
            context,
            labels,
            buildArgs
        } = params;

        const dockerfile = "dockerfile" in params
            ? params.dockerfile
            : params.src;

        const pack = tar.pack({});
        const paths = new Set();

        (Array.isArray(context) ? [...context] : [context])
            .reverse()
            .forEach((context) => {
                const fs = new FileSystem(context, this.driver);
                const files = fs.readdir("", {
                    recursive: true
                });

                const filter = fs.exists(".dockerignore")
                    ? DockerIgnore({ignorecase: false})
                        .add(fs.readFile(".dockerignore").toString())
                        .createFilter()
                    : () => true;

                files.forEach((file) => {
                    if(paths.has(file) || !filter(file)) {
                        return;
                    }

                    const stat = fs.stat(file);

                    if(stat.isDirectory()) {
                        pack.entry({
                            type: "directory",
                            name: file,
                            size: 0,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid
                        });
                    }
                    else if(stat.isFile()) {
                        paths.add(file);
                        pack.entry({
                            type: "file",
                            name: file,
                            size: stat.size,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid
                        }, fs.readFile(file));
                    }
                    else if(stat.isSymbolicLink()) {
                        paths.add(file);
                        pack.entry({
                            type: "symlink",
                            name: file,
                            linkname: fs.readlink(file),
                            size: 0,
                            mtime: stat.mtime,
                            uid: stat.uid,
                            gid: stat.gid
                        });
                    }
                });
            });

        pack.finalize();

        const stream = await this.docker.buildImage(pack.pipe(zlib.createGzip()), {
            version,
            t: tag,
            labels,
            buildargs: Object.keys(buildArgs || {}).reduce<EnvConfig>((res, key) => {
                if(buildArgs) {
                    const value = buildArgs[key];

                    if(typeof value !== "undefined") {
                        res[key] = typeof value !== "string" ? (value as any).toString() : value;
                    }
                }

                return res;
            }, {}),
            rm: true,
            dockerfile
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
