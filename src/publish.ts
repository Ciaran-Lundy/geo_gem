import { personalSpace, type Op } from "@geoprotocol/geo-sdk";
import { config } from "./config.js";
import { wallet } from "./wallet.js";

type PublishOptions = {
    spaceId: string;
    editName: string;
    ops: Op[];
};

export async function publish(options: PublishOptions): Promise<string> {
    const { to, calldata } = await personalSpace.publishEdit({
        name: options.editName,
        spaceId: options.spaceId,
        ops: options.ops,
        author: config.personalSpaceId,
        network: config.network,
    });

    return wallet.sendTransaction({ to, data: calldata }) as Promise<string>;
}
