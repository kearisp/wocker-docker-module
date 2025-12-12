import Modem, {ConstructorOptions, DialOptions, RequestCallback} from "docker-modem";
import {Logger} from "@kearisp/cli";
import {Fixtures} from "./Fixtures";
import {Router, Request, Response} from "../router";
import {HttpMethod} from "../types/HttpMethod";


type Options = ConstructorOptions & {
    recordFixtures?: Fixtures;
};

export class ModemRecorder extends Modem {
    protected router: Router;
    protected fixtures?: Fixtures;

    public constructor({recordFixtures, ...rest}: Options) {
        super(rest);

        this.router = new Router();
        this.fixtures = recordFixtures;

        this.router.get(["/containers/json", "/:version/containers/json"], (req: Request, res: Response): void => {
            const {
                body: result
            } = req;

            if(this.fixtures) {
                this.fixtures.recordJSON(result);
            }

            res.send(null);
        });

        this.router.get(["/images/:tag/json", "/:version/images/:tag/json"], (req: Request, res: Response): void => {
            const {
                params: {
                    version = "v1",
                    tag: fullName
                },
                body: result
            } = req;

            const [, image, tag] = /^([^:]+):(.*)$/.exec(fullName) || [];

            if(this.fixtures) {
                this.fixtures.saveImage(version, image, tag, result);
            }

            res.send(null);
        });

        this.router.post(["/images/create", "/:version/images/create"], async (req: Request, res: Response): Promise<void> => {
            const {
                params: {
                    version = "v1"
                },
                options: {
                    fromImage,
                    tag
                },
                body: stream
            } = req;

            if(this.fixtures && stream) {
                await this.fixtures.recordPullStream(version, fromImage, tag, stream);
            }

            res.send(null);
        });

        this.router.post(["/build", "/:version/build"], async (req: Request, res: Response): Promise<void> => {
            const {
                params: {
                    version = "v1"
                },
                options: {
                    t: fullName,
                    version: buildVersion = "1"
                },
                body: stream
            } = req;

            if(this.fixtures && stream) {
                const [image, tag] = fullName.split(":");

                Logger.info("Building...", version, buildVersion, image, tag);

                await this.fixtures.recordBuildStream(version, buildVersion, image, tag, stream);
            }

            res.send(null);
        });
    }

    public dial(options: DialOptions, callback?: RequestCallback): void {
        super.dial(options, (err, result): void => {
            const {
                path,
                method,
                options: body
            } = options;

            Logger.info("Recorder dial:", method, path);
            // console.log("Recorder dial:", method, path);
            this.router.exec(method as HttpMethod, path, result, body).catch(() => undefined);

            callback && callback(err, result);
        });
    }

    public setFixtures(fixtures: Fixtures): this {
        this.fixtures = fixtures;

        return this;
    }
}
