import Modem from "docker-modem";
import type {
    ConstructorOptions,
    DialOptions,
    RequestCallback
} from "docker-modem";
import {DockerStorage} from "./DockerStorage";
import {Fixtures} from "./Fixtures";
import {HttpMethod} from "../types/HttpMethod";


type Options = ConstructorOptions & {
    mockFixtures?: Fixtures;
};

export class ModemMock extends Modem {
    protected storage: DockerStorage;
    protected version!: string;

    public constructor({mockFixtures, ...rest}: Options) {
        super(rest);

        this.storage = new DockerStorage();

        if(mockFixtures) {
            this.storage.registerFixtures(mockFixtures);
        }
    }

    public dial(options: DialOptions, callback?: RequestCallback): void {
        const {
            method,
            // statusCodes,
            options: body,
            file
        } = options;

        if(this.version) {
            options.path = `/${this.version}${options.path}`;
        }

        (async (): Promise<void> => {
            if(file && typeof file !== "string" && "on" in file) {
                await new Promise<void>((resolve) => {
                    file.on("data", () => undefined);
                    file.on("close", resolve);
                    file.on("error", resolve);
                });
            }

            try {
                const result = await this.storage.exec(
                    method as HttpMethod,
                    options.path,
                    body
                );

                callback && callback(null, result);
            }
            catch(err) {
                callback && callback(err as Error, null)
            }
        })();
    }

    public registerFixtures(fixtures: Fixtures): void {
        this.storage.registerFixtures(fixtures);
    }

    public reset(): void {
        this.storage.reset();
    }
}
