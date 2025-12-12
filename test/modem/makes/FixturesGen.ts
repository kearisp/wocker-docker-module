import {Readable} from "stream";
import {Fixtures} from "./Fixtures";


export class FixturesGen extends Fixtures {
    public build(version: string, builderVersion: string, image: string, tag: string): Readable {
        const stream = new Readable({
            objectMode: true
        });

        stream.push(`{"stream":"Successfully built 8fadf8b40731\\n"}`);
        stream.push(`{"stream":"Successfully tagged ${tag}\\n"}`);
        stream.push(null);

        stream.emit("readable");

        return stream;
    }
}
