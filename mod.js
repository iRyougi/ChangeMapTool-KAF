import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import * as fs from 'fs';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const mapPrettyName = { "MP_Amiens": "亚眠", "MP_ItalianCoast": "帝国边境", "MP_ShovelTown": "攻占托尔", "MP_MountainFort": "格拉巴山", "MP_Graveyard": "决裂", "MP_FaoFortress": "法欧堡", "MP_Chateau": "流血宴厅", "MP_Scar": "圣康坦的伤痕", "MP_Suez": "苏伊士", "MP_Desert": "西奈沙漠", "MP_Forest": "阿尔贡森林", "MP_Giant": "庞然暗影", "MP_Verdun": "凡尔登高地", "MP_Trench": "尼维尔之夜", "MP_Underworld": "法乌克斯要塞", "MP_Fields": "苏瓦松", "MP_Valley": "加利西亚", "MP_Bridge": "勃鲁西洛夫关口", "MP_Tsaritsyn": "察里津", "MP_Ravines": "武普库夫山口", "MP_Volga": "窝瓦河", "MP_Islands": "阿尔比恩", "MP_Beachhead": "海丽丝岬", "MP_Harbor": "泽布吕赫", "MP_Ridge": "阿奇巴巴", "MP_River": "卡波雷托", "MP_Hell": "帕斯尚尔", "MP_Offensive": "索姆河", "MP_Naval": "黑尔戈兰湾", "MP_Blitz": "伦敦的呼唤：夜袭", "MP_London": "伦敦的呼唤：灾祸", "MP_Alps": "剃刀边缘" };
const campaignName = ["征服地狱", "皇帝会战", "铜墙铁壁", "石油帝国", "跨越马恩", "恶魔熔炉", "勃鲁西洛夫攻势", "", "赤潮", "加里波利", "泽布吕赫", "武普库夫山口", "索姆河", "攻占托尔", "庞然暗影"];

function ask(question) {
    return new Promise(resolve => {
        rl.question(question, input => resolve(input));
    });
}

(async () => {
    try {
        fs.mkdirSync(path.join(__dirname, "./profile"));
    } catch (e) { }
    if (!fs.existsSync(path.join(__dirname, "./profile/server.json"))) fs.writeFileSync(path.join(__dirname, "./profile/server.json"), "[]");
    const servers = JSON.parse(fs.readFileSync(path.join(__dirname, "./profile/server.json")));
    if (!fs.existsSync(path.join(__dirname, "./profile/account.json"))) fs.writeFileSync(path.join(__dirname, "./profile/account.json"), "{}");
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, "./profile/account.json")));
    function save() {
        fs.writeFileSync(path.join(__dirname, "./profile/server.json"), JSON.stringify(servers));
        fs.writeFileSync(path.join(__dirname, "./profile/account.json"), JSON.stringify(accounts));
    }
    let menu = "Main";
    let param;
    let error;
    while (true) {
        console.clear();
        console.log(menu + "\n");
        if (error) {
            console.log(error);
            await ask("\n按回车以继续");
            error = null;
            continue;
        }
        switch (menu) {
            case "ServerList": {
                let i = 2;
                console.log(`(1) 添加服务器`);
                console.log(servers.map(server => `(${i++}) ${server.name}`).join("\n"));
                console.log(`(0) 返回上一级`);
                let num = await ask("\n请输入操作编号:");
                if (num === "0") {
                    menu = "Main";
                    continue;
                }
                num = Number(num);
                if (num === 1) {
                    menu = "AddServer";
                    continue;
                }
                if (!num || !servers[num - 2]) continue;
                menu = "Server";
                param = num - 2;
                continue;
            }
            case "DelServer": {
                servers.splice(param,1);
                save();
                menu = "ServerList";
                continue;
            }
            case "AddServer": {
                if (!Object.keys(accounts).length) {
                    error = "请先添加账号";
                    menu = "Main";
                    continue;
                }
                const gameId = Number(await ask("请输入GameId:"));
                if (servers.find(server => server.gameId === gameId)) {
                    error = "服务器已存在";
                    menu = "ServerList";
                    continue;
                }
                console.clear();
                let i = 1;
                console.log(Object.keys(accounts).map(id => `(${i++}) ${accounts[id].name}`).join("\n"));
                let result = await ask("\n请选择账号:");
                if (!result.match(/^[0-9]+$/)) continue;
                const num = Number(result);
                if (num < 1 || num > Object.keys(accounts).length) continue;
                const account = Object.keys(accounts)[num - 1];
                console.clear();
                console.log(`正在获取服务器信息`);
                let detail;
                try {
                    detail = await fetchBF1Api("GameServer.getServerDetails", accounts[account].sessionId, { gameId: gameId });
                } catch (err) {
                    error = "获取信息失败";
                    menu = "ServerList";
                    continue;
                }
                servers.push({ gameId: gameId, currentMap: detail.mapName, time: new Date().getTime(), skipTime: 300, mode: 0, runmode: 0, minimumPlayer: 40, whiteList: [], history: [], historySkipCount: 3, name: detail.name, account: account });
                save();
                menu = "Server";
                param = servers.length - 1;
                continue;
            }
            case "Server": {
                const server = servers[param];
                console.log(`${server.name}\nGameId:${server.gameId}\n`
                    + `当前地图:${mapPrettyName[server.currentMap] || server.currentMap}\n`
                    + `开始时间:${moment(server.time).format("YYYY-MM-DD HH:mm:SS")}\n`
                    + `跳过时间:${server.skipTime}秒\n`
                    + `历史游玩:${server.history.map(i => campaignName[i]).join(" ")}\n`
                    + `(1) 状态:${server.mode ? "正在运行" : "未开启"}\n`
                    + `(2) 启动模式:${server.runmode ? "结束后不换边切图（测试版）" : "结束后换边并切图"}\n`
                    + `(3) 启动人数:${server.minimumPlayer}\n`
                    + `(4) 白名单:${server.whiteList.length ? server.whiteList.map(i => campaignName[i]).join(" ") : "无"}\n`
                    + `(5) 历史游玩跳过次数:${server.historySkipCount}\n`
                    + `(6) 账号:${server.account && accounts[server.account] && accounts[server.account].name || "无"}\n`
                    + `(7) 删除服务器`
                );
                console.log(`(0) 返回上一级`);
                const num = await ask("\n请输入操作编号:");
                switch (num) {
                    case "0":
                        menu = "ServerList";
                        continue;
                    case "1":
                        menu = "Server-Stat";
                        continue;
                    case "2":
                        menu = "Server-RunMode";
                        continue;
                    case "3":
                        menu = "Server-MinimumPlayer";
                        continue;
                    case "4":
                        menu = "Server-WhiteList";
                        continue;
                    case "5":
                        menu = "Server-HistorySkipCount";
                        continue;
                    case "6":
                        menu = "Server-Account";
                        continue;
                    case "7":
                        menu = "DelServer";
                        continue;
                    default:
                        continue;
                }
            }
            case "Server-Stat": {
                servers[param].mode = servers[param].mode ? 0 : 1;
                save();
                menu = "Server";
                continue;
            }
            case "Server-RunMode": {
                servers[param].runmode = servers[param].runmode ? 0 : 1;
                save();
                menu = "Server";
                continue;
            }
            case "Server-MinimumPlayer": {
                const server = servers[param];
                console.log(`${server.name}\nGameId:${server.gameId}\n`
                    + `当前地图:${mapPrettyName[server.currentMap] || server.currentMap}\n`
                    + `开始时间:${moment(server.time).format("YYYY-MM-DD HH:mm:SS")}\n`
                    + `跳过时间:${server.skipTime}秒\n`
                    + `历史游玩:${server.history.map(i => campaignName[i]).join(" ")}\n`
                    + `启动人数:${server.minimumPlayer}\n`
                );
                const result = await ask("请输入新的启动人数(1-64):");
                if (!result.match(/^[0-9]+$/)) continue;
                const num = Number(result);
                if (num < 1 || num > 64) continue;
                server.minimumPlayer = num;
                save();
                menu = "Server";
                continue;
            }
            case "Server-WhiteList": {
                const whiteList = servers[param].whiteList;
                campaignName.forEach((name, index) => {
                    if (!name) return;
                    console.log(`(${index + 1}) ${name} [${whiteList.includes(index) ? "✓" : " "}]`);
                });
                console.log("(0) 返回上一级");
                const result = await ask(`\n请输入操作编号:`);
                if (!result.match(/^[0-9]+$/)) continue;
                if (result === "0") {
                    menu = "Server";
                    continue;
                }
                const num = Number(result) - 1;
                if (num < 0 || num > 14) continue;
                if (whiteList.includes(num)) {
                    whiteList.splice(whiteList.indexOf(num), 1);
                } else {
                    whiteList.push(num);
                }
                save();
                continue;
            }
            case "Server-HistorySkipCount": {
                const server = servers[param];
                console.log(`${server.name}\nGameId:${server.gameId}\n`
                    + `当前地图:${mapPrettyName[server.currentMap] || server.currentMap}\n`
                    + `开始时间:${moment(server.time).format("YYYY-MM-DD HH:mm:SS")}\n`
                    + `跳过时间:${server.skipTime}秒\n`
                    + `历史游玩:${server.history.map(i => campaignName[i]).join(" ")}\n`
                    + `历史游玩跳过次数:${server.historySkipCount}\n`
                );
                const result = await ask("请输入新的历史游玩跳过次数(1-10):");
                if (!result.match(/^[0-9]+$/)) continue;
                const num = Number(result);
                if (num <= 1 || num > 11) continue;
                server.historySkipCount = num;
                save();
                menu = "Server";
                continue;
            }
            case "Server-Account": {
                const server = servers[param];
                if (!Object.keys(accounts).length) {
                    error = "请先添加账号";
                    menu = "Server";
                    continue;
                }
                let i = 1;
                console.log(Object.keys(accounts).map(id => `(${i++}) ${accounts[id].name}`).join("\n"));
                let result = await ask("\n请选择新的账号:");
                if (!result.match(/^[0-9]+$/)) continue;
                const num = Number(result);
                if (num < 1 || num > Object.keys(accounts).length) continue;
                server.account = Object.keys(accounts)[num - 1];
                save();
                menu = "Server";
                continue;
            }

            case "AccountList": {
                let i = 2;
                console.log(`(1) 添加账号/更新Cookie`);
                console.log(Object.keys(accounts).map(id => `(${i++}) 删除 ${accounts[id].name}`).join("\n"));
                console.log(`(0) 返回上一级`);
                let num = await ask("\n请输入操作编号:");
                if (num === "0") {
                    menu = "Main";
                    continue;
                }
                num = Number(num);
                if (num === 1) {
                    menu = "AddAccount";
                    continue;
                }
                if (!num || !servers[num - 2]) continue;
                menu = "DelAccount";
                param = num - 2;
                continue;
            }
            case "AddAccount": {
                const cookie = await ask("请输入Remid:");
                console.log("正在登录");
                try {
                    const { remid, sid, sessionId, personaId, name } = await getSession({ remid: cookie });
                    accounts[personaId] = { name: name, remid: remid, sid: sid, sessionId: sessionId };
                } catch (err) {
                    try {
                        const { remid, sid, sessionId, personaId, name } = await getSession({ sid: cookie });
                        accounts[personaId] = { name: name, remid: remid, sid: sid, sessionId: sessionId };
                    } catch (err) {
                        error = "登录失败";
                        menu = "AccountList";
                        continue;
                    }
                }
                save();
                menu = "AccountList";
                continue;
            }
            case "DelAccount": {
                delete accounts[Object.keys(accounts)[param]];
                save();
                menu = "AccountList";
                continue;
            }
            case "main":
            default: {
                console.log(
                    `(1) 进入服务器列表`
                    + `\n(2) 进入账号列表`
                    + `\n(3) 退出`
                );
                const num = await ask("\n请输入操作编号:");
                switch (num) {
                    case "1":
                        menu = "ServerList";
                        continue;
                    case "2":
                        menu = "AccountList";
                        continue;
                    case "3":
                        process.exit();
                    default:
                        continue;
                }
            }
        }
    }
})();

async function getSession({ remid, sid } = {}) {
    if (!remid && !sid) throw new Error("未提供Cookie");
    const Cookie = `${remid ? `remid=${remid};` : ''}${sid ? `sid=${sid};` : ''}`;
    let response = await fetch('https://accounts.ea.com/connect/auth?response_type=code&locale=zh_CN&client_id=sparta-backend-as-user-pc&display=junoWeb%2Flogin', {
        redirect: 'manual',
        headers: { "Cookie": Cookie }
    });
    const location = response.headers.get('location');
    if (location.match("fid=")) throw new Error("Cookie失效");
    const authCode = location.replace(/.*code=(.*)/, '$1');
    const newCookie = response.headers.get('set-cookie').split(/\s+/);
    if (newCookie.find(item => item.match(/^sid=/))) {
        sid = newCookie.find(item => item.match(/^sid=/)).replace(/sid=(.*?);/, '$1');
    }
    if (newCookie.find(item => item.match(/^remid=/))) {
        remid = newCookie.find(item => item.match(/^remid=/)).replace(/remid=(.*?);/, '$1');
    }
    const result = await fetchBF1Api("Authentication.getEnvIdViaAuthCode", null, { authCode: authCode });
    const persona = await fetchBF1Api("RSP.getPersonasByIds", result.sessionId, { personaIds: [result.personaId] });
    return { remid: remid, sid: sid, sessionId: result.sessionId, personaId: result.personaId, name: persona[result.personaId].displayName };
}

async function fetchBF1Api(method, sessionId, params = {}) {
    const baseUrl = "https://sparta-gw.battlelog.com/jsonrpc/pc/api";
    params.game = "tunguska";
    const body = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": 1,
    };
    const init = {
        body: JSON.stringify(body),
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
    };
    if (sessionId) { init.headers["X-GatewaySession"] = sessionId; }

    const response = await fetch(baseUrl, init);
    const result = await response.json();

    if (result.error) {
        throw new Error("请求错误");
    }

    return result.result;
}

async function getTopPlayers(server) {
    const detail = await fetchBF1Api("GameServer.getServerDetails", server.account, { gameId: server.gameId });
    const players = detail.slots.Soldier.players;

    if (!players || players.length === 0) {
        logger.info(`${detail.name.substr(0, 20)} 没有玩家`);
        return [];
    }

    const playerLevels = await Promise.all(players.map(async player => {
        const stats = await fetchBF1Api("Stats.detailedStatsByPersonaId", server.account, { game: "tunguska", personaId: player.personaId });
        return {
            personaId: player.personaId,
            level: stats.rank,
            roundsPlayed: stats.roundsPlayed
        };
    }));

    playerLevels.sort((a, b) => b.level - a.level);

    return playerLevels.slice(0, 3);
}

async function monitorTopPlayers(server) {
    const topPlayers = await getTopPlayers(server);

    if (topPlayers.length === 0) return false;

    const initialRounds = topPlayers.map(player => player.roundsPlayed);

    for (let i = 0; i < 30; i++) {
        await sleep(1000);  // 每秒检查一次

        const newRounds = await Promise.all(topPlayers.map(async player => {
            const stats = await fetchBF1Api("Stats.detailedStatsByPersonaId", server.account, { game: "tunguska", personaId: player.personaId });
            return stats.roundsPlayed;
        }));

        let increasedCount = 0;
        for (let j = 0; j < topPlayers.length; j++) {
            if (newRounds[j] > initialRounds[j]) {
                increasedCount++;
            }
        }

        if (increasedCount >= topPlayers.length) {
            return true;
        }
    }

    return false;
}
