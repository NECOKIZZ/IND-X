// Copies the Anchor IDL and its TS type into the server package.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("server/src/chain/idl", { recursive: true });
copyFileSync("target/idl/league.json", "server/src/chain/idl/league.json");
copyFileSync("target/types/league.ts", "server/src/chain/idl/league.ts");
console.log("IDL copied to server/src/chain/idl");
