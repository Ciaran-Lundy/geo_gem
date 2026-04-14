import { getSmartAccountWalletClient } from "@geoprotocol/geo-sdk";
import { config } from "./config.js";

export const wallet = await getSmartAccountWalletClient({ privateKey: config.privateKey });
