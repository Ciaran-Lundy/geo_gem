import "dotenv/config";

const raw = process.env.GEO_PRIVATE_KEY;
if (!raw) throw new Error("GEO_PRIVATE_KEY not set in .env");
const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
        `GEO_PRIVATE_KEY looks wrong — expected 0x + 64 hex chars (32 bytes). ` +
        `Got ${privateKey.length} chars. Make sure you're using your private key, not your wallet address.`,
    );
}
if (!process.env.GEO_PERSONAL_SPACE_ID) throw new Error("GEO_PERSONAL_SPACE_ID not set in .env");
if (!process.env.GEO_SPACE_ID) throw new Error("GEO_SPACE_ID not set in .env");

export const config = {
    privateKey,
    personalSpaceId: process.env.GEO_PERSONAL_SPACE_ID,
    spaceId: process.env.GEO_SPACE_ID,
    network: (process.env.GEO_NETWORK ?? "TESTNET") as "TESTNET",
};
