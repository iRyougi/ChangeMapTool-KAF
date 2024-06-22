import { GatewayClient } from "./lib/gatewayClient.js"
import { BlazeClient } from "./lib/blazeClient.js"
import { getBlazeAuthCode, getGatewayAuthCode } from "./lib/login.js"
import { promises as fs } from "fs"
import log4js from 'log4js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fsc from 'fs';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
log4js.configure({ "appenders": { "console": { "type": "stdout" }, "file": { type: "dateFile", filename: path.join(__dirname, 'log/CMT'), pattern: "yyyy-MM-dd.log", alwaysIncludePattern: true, numBackups: 60 } }, "categories": { "default": { "appenders": ["console", "file"], "level": "trace" }, "gateway": { "appenders": ["console", "file"], "level": "trace" } } })
export const loggest = log4js.getLogger()

if (!fsc.existsSync(path.join(__dirname, "./profile/account.json"))) fsc.writeFileSync(path.join(__dirname, "./profile/account.json"), "{}");
const accounts = JSON.parse(fsc.readFileSync(path.join(__dirname, "./profile/account.json")));

if (!fsc.existsSync(path.join(__dirname, "./profile/server.json"))) fsc.writeFileSync(path.join(__dirname, "./profile/server.json"), "[]");
const servers = JSON.parse(fsc.readFileSync(path.join(__dirname, "./profile/server.json")));

const gatewayClient = new GatewayClient({
    loginFail: err => { throw err },
    getAuthCode: async () => await getAuthCode("gateway")
})
gatewayClient.login()
const gateway = gatewayClient.send.bind(gatewayClient)

const blazeClient = new BlazeClient({
    loginFail: err => { throw err },
    getAuthCode: async () => await getAuthCode("blaze")
})
blazeClient.login()
const blaze = blazeClient.send.bind(blazeClient)

export { gateway, blaze }

async function getAuthCode(type) {
    const data = JSON.parse(await fs.readFile("./profile/account.json"))
    const { remid, sid, authCode } = await (type === "gateway" ? getGatewayAuthCode : getBlazeAuthCode)({ remid: data.remid, sid: data.sid })
    if ((remid && data.remid !== remid) || (sid && data.sid !== sid)) {
        const data = JSON.parse(await fs.readFile("./profile/account.json"))
        data.remid = remid
        data.sid = sid
        await fs.writeFile("./profile/account.json", JSON.stringify(data, null, "\t"))
    }
    return authCode
}