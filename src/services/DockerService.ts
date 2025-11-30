import {
    Injectable,
    DockerService as CoreDockerService,
    DockerServiceParams as Params,
    LogService
} from "@wocker/core";
import {Duplex} from "node:stream";
import type Docker from "dockerode";
import type {Container, Volume, VolumeCreateResponse} from "dockerode";
import {ContainerService} from "./ContainerService";
import {ModemService} from "./ModemService";
import {ImageService} from "./ImageService";


@Injectable("DOCKER_SERVICE")
export class DockerService extends CoreDockerService {
    public constructor(
        protected readonly modemService: ModemService,
        protected readonly containerService: ContainerService,
        protected readonly imageService: ImageService,
        protected readonly logService: LogService
    ) {
        super();
    }

    public get docker(): Docker {
        return this.modemService.docker;
    }

    public async createVolume(name: string): Promise<VolumeCreateResponse> {
        return await this.docker.createVolume({
            Name: name,
            Driver: "local"
        });
    }

    public async hasVolume(name: string): Promise<boolean> {
        const volume = await this.getVolume(name);

        try {
            await volume.inspect();

            return true;
        }
        catch(err) {
            return false;
        }
    }

    public async getVolume(name: string): Promise<Volume> {
        return this.docker.getVolume(name);
    }

    public async rmVolume(name: string): Promise<void> {
        const volume = await this.getVolume(name);

        await volume.remove();
    }

    public async createContainer(params: Params.CreateContainer): Promise<Container> {
        return this.containerService.create(params);
    }

    public async getContainer(name: string): Promise<Container|null> {
        return this.containerService.get(name);
    }

    public async removeContainer(name: string): Promise<void> {
        await this.containerService.rm(name);
    }

    public async buildImage(params: Params.BuildImage): Promise<void> {
        await this.imageService.build(params);
    }

    public async imageExists(tag: string): Promise<boolean> {
        return this.imageService.exists(tag);
    }

    public async imageRm(tag: string, force: boolean = false): Promise<void> {
        await this.imageService.rm(tag, force);
    }

    public async imageLs(options?: Params.ImageList) {
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

    public async pullImage(tag: string): Promise<void> {
        await this.imageService.pull(tag);
    }

    public async attach(containerOrName: string|Container): Promise<NodeJS.ReadWriteStream|null> {
        let container: Container|null = typeof containerOrName === "string"
            ? await this.getContainer(containerOrName)
            : containerOrName;

        if(!container) {
            return null;
        }

        const stream: NodeJS.ReadWriteStream = await container.attach({
            stream: true,
            hijack: true,
            stdin: true,
            stdout: true,
            stderr: true,
            logs: true,
            detachKeys: "ctrl-d"
        });

        await this.attachStream(stream);

        const handleResize = (): void => {
            const [width, height] = process.stdout.getWindowSize();

            container.resize({
                w: width,
                h: height
            });
        };

        process.stdout.on("resize", handleResize);

        handleResize();

        return stream;
    }

    public async attachStream(stream: NodeJS.ReadWriteStream): Promise<NodeJS.ReadWriteStream> {
        return this.modemService.attachStream(stream);
    }

    public async exec(nameOrContainer: string|Container, options: Params.Exec|string[], _tty?: boolean): Promise<Duplex|null> {
        return await this.containerService.exec(nameOrContainer, options, _tty);
    }

    public async logs(containerOrName: string|Container): Promise<NodeJS.ReadableStream|null> {
        const container: Container|null = typeof containerOrName === "string"
            ? await this.getContainer(containerOrName)
            : containerOrName;

        if(!container) {
            return null;
        }

        const stream = await container.logs({
            stdout: true,
            stderr: true,
            follow: true,
            tail: 4
        });

        stream.on("data", (data: any) => {
            process.stdout.write(data);
        });

        stream.on("error", (data: any) => {
            process.stderr.write(data);
        });

        return stream;
    }

    public async followProgress(stream: NodeJS.ReadableStream): Promise<void> {
        await this.modemService.followProgress(stream);
    }
}
