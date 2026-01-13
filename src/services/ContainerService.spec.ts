import {describe, it, expect, afterEach, jest} from "@jest/globals";
import {FileSystem} from "@wocker/core";
import {Test} from "@wocker/testing";
import {ModemMock, Fixtures} from "docker-modem-mock";
import {ModemService} from "./ModemService";
import {ROOT_DIR} from "../env";
import {ImageService} from "./ImageService";
import {ContainerService} from "./ContainerService";
import {ProtoService} from "./ProtoService";


describe("ContainerService", () => {
    const fs = new FileSystem(`${ROOT_DIR}/fixtures`),
          fixtures = Fixtures.fromFS(fs);

    afterEach((): void => {
        jest.resetAllMocks();
    });

    const getContext = async () => {
        class TestModemService extends ModemService {
            protected _modem?: ModemMock;

            public get modem(): ModemMock {
                if(!this._modem) {
                    this._modem = new ModemMock({
                        mockFixtures: fixtures
                    });
                }

                return this._modem;
            }
        }

        return Test
            .createTestingModule({
                providers: [
                    ContainerService,
                    ImageService,
                    ModemService,
                    ProtoService
                ]
            })
            .overrideProvider(ModemService).useProvider(TestModemService)
            .build();
    };

    it("should create container", async () => {
        const context = await getContext(),
              containerService = context.get(ContainerService);

        expect(containerService).toBeInstanceOf(ContainerService);

        const spyWrite = jest.spyOn(process.stdout, "write");
        spyWrite.mockImplementation(() => true);

        const container = await containerService.create({
            name: "Test",
            image: "php:8.3-apache"
        });

        expect(spyWrite).toHaveBeenCalled();
        spyWrite.mockReset();

        console.log(">_<_<");

        const inspect = await container.inspect();

        expect(inspect.Name).toBe("Test");
    });
});
