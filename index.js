import log4js from 'log4js';
import fetch from 'node-fetch';

import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import { scheduleJob } from 'node-schedule';
import { Agent } from 'https';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agent = new Agent({ keepAlive: true });
// const fetch = require('node-fetch');

const apiBaseURL = 'https://api.gametools.network';
const apiEndpoint = '/bf1/players';
const platform = 'pc'; 

async function getPlayerStats(playerName) {
    const response = await fetch(`${apiBaseURL}${apiEndpoint}?name=${playerName}&platform=${platform}`);
    if (!response.ok) {
        throw new Error(`Error fetching player stats: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
}

log4js.configure({
    appenders: {
        fileLog: {
            type: "dateFile",
            filename: path.join(__dirname, 'log/CMT'),
            pattern: "yyyy-MM-dd.log",
            alwaysIncludePattern: true,
        },
        console: { type: 'console' }
    },
    categories: {
        default: { appenders: ['console', 'fileLog'], level: 'info' },
        check: { appenders: ['console', 'fileLog'], level: 'info' }
    }
});

const mapPrettyName = { "MP_Amiens": "亚眠", "MP_ItalianCoast": "帝国边境", "MP_ShovelTown": "攻占托尔", "MP_MountainFort": "格拉巴山", "MP_Graveyard": "决裂", "MP_FaoFortress": "法欧堡", "MP_Chateau": "流血宴厅", "MP_Scar": "圣康坦的伤痕", "MP_Suez": "苏伊士", "MP_Desert": "西奈沙漠", "MP_Forest": "阿尔贡森林", "MP_Giant": "庞然暗影", "MP_Verdun": "凡尔登高地", "MP_Trench": "尼维尔之夜", "MP_Underworld": "法乌克斯要塞", "MP_Fields": "苏瓦松", "MP_Valley": "加利西亚", "MP_Bridge": "勃鲁西洛夫关口", "MP_Tsaritsyn": "察里津", "MP_Ravines": "武普库夫山口", "MP_Volga": "窝瓦河", "MP_Islands": "阿尔比恩", "MP_Beachhead": "海丽丝岬", "MP_Harbor": "泽布吕赫", "MP_Ridge": "阿奇巴巴", "MP_River": "卡波雷托", "MP_Hell": "帕斯尚尔", "MP_Offensive": "索姆河", "MP_Naval": "黑尔戈兰湾", "MP_Blitz": "伦敦的呼唤：夜袭", "MP_London": "伦敦的呼唤：灾祸", "MP_Alps": "剃刀边缘" };
const opNextMap = { "MP_MountainFort": "MP_ItalianCoast", "MP_Chateau": "MP_Forest", "MP_Scar": "MP_Amiens", "MP_FaoFortress": "MP_Suez", "MP_Suez": "MP_Desert", "MP_Verdun": "MP_Underworld", "MP_Fields": "MP_Graveyard", "MP_Valley": "MP_Bridge", "MP_Volga": "MP_Tsaritsyn", "MP_Beachhead": "MP_Ridge" };
const operaions = [["MP_Chateau", "MP_Forest"], ["MP_Scar", "MP_Amiens"], ["MP_MountainFort", "MP_ItalianCoast"], ["MP_FaoFortress", "MP_Suez", "MP_Desert"], ["MP_Fields", "MP_Graveyard"], ["MP_Verdun", "MP_Underworld"], ["MP_Valley", "MP_Bridge"], [], ["MP_Volga", "MP_Tsaritsyn"], ["MP_Beachhead", "MP_Ridge"], ["MP_Harbor"], ["MP_Ravines"], ["MP_Offensive"], ["MP_ShovelTown"], ["MP_Giant"]];
const operationIndex = { "MP_Chateau": 0, "MP_Forest": 0, "MP_Scar": 1, "MP_Amiens": 1, "MP_MountainFort": 2, "MP_ItalianCoast": 2, "MP_FaoFortress": 3, "MP_Suez": 3, "MP_Desert": 3, "MP_Fields": 4, "MP_Graveyard": 4, "MP_Verdun": 5, "MP_Underworld": 5, "MP_Valley": 6, "MP_Bridge": 6, "MP_Volga": 8, "MP_Tsaritsyn": 8, "MP_Beachhead": 9, "MP_Ridge": 9, "MP_Harbor": 10, "MP_Ravines": 11, "MP_Offensive": 12, "MP_ShovelTown": 13, "MP_Giant": 14 };

const logger = log4js.getLogger('check');

if (!fs.existsSync(path.join(__dirname, "./profile/account.json"))) fs.writeFileSync(path.join(__dirname, "./profile/account.json"), "{}");
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, "./profile/account.json")));

if (!fs.existsSync(path.join(__dirname, "./profile/server.json"))) fs.writeFileSync(path.join(__dirname, "./profile/server.json"), "[]");
const servers = JSON.parse(fs.readFileSync(path.join(__dirname, "./profile/server.json")));

function now() {
    return new Date().getTime();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getGameCount(sessionId, personaId) {
    const response = await fetchBF1Api("Stats.detailedStatsByPersonaId", sessionId, { game: "tunguska", personaId });
    return response.roundsPlayed || 0;
}

async function monitorPlayers(server) {
    try {
        const detail = await fetchBF1Api("GameServer.getServerDetails", server.account, { gameId: server.gameId });

        

        // 获取当前玩家数量
        const currentPlayerCount = detail.slots.Soldier.current;

        // 判断当前是否有玩家
        if (currentPlayerCount === 0) {
            logger.info(`${detail.name.substr(0, 20)} 没有玩家`);
            return false;
        }

        // 获取所有玩家的详细信息
        const players = detail.slots.Soldier.players;  // 请根据实际的字段名称进行调整
        // if (!players || players.length === 0) {
        //     logger.warn(`${detail.name.substr(0, 20)} 获取玩家详细信息失败`);
        //     return false;
        // }

        // 获取所有玩家的初始游戏场次
        const initialCounts = await Promise.all(players.map(player => getPlayerStats(player.name).then(data => data.roundsPlayed)));

        let increasedCount = 0;
        for (let i = 0; i < 30; i++) {
            await sleep(1000);  // 每秒检查一次

            // 获取所有玩家的新游戏场次
            const newCounts = await Promise.all(players.map(player => getPlayerStats(player.name).then(data => data.roundsPlayed)));

            increasedCount = 0;
            for (let j = 0; j < players.length; j++) {
                if (newCounts[j] > initialCounts[j]) {
                    increasedCount++;
                }
            }

            // 检查是否有20位以上玩家游戏场次增加
            if (increasedCount >= 20) {
                return true;
            }
        }
    } catch (error) {
        logger.error(`Error in monitorPlayers: ${error.message}`);
        return false;
    }

    return false;
}

async function changeMap(server) {
    const detail = await fetchBF1Api("GameServer.getServerDetails", server.account, { gameId: server.gameId });
    const mapName = detail && detail.mapName || null;
    if (!mapName) throw new Warn(`${server.name && server.name.substr(0, 20)} 获取信息失败`);
    if (detail.mapMode !== "BreakthroughLarge") throw new Warn(`${server.name && server.name.substr(0, 20)} 模式错误`);
    server.name = detail.name;
    if (server.history.length > 10) server.history.length = 10;
    server.history = server.history.filter(item => item || item === 0);

    if (server.runmode === 1) {
        const shouldChangeMap = await monitorPlayers(server);
        if (!shouldChangeMap) {
            logger.info(`${detail.name.substr(0, 20)} 没有足够的玩家游戏场次增加，跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }

        const mapSequence = server.whiteList.map(index => operations[index][0]);
        const mapToChangeList = shuffle(mapSequence.filter(map => detail.rotation.some(r => r.mapImage.includes(map))));

        if (!mapToChangeList.length) {
            throw new Error(`${server.name} 白名单中的地图序列为空`);
        }

        const mapid = mapToChangeList[0];

        if (now() - server.lastChangeTime <= server.skipTime / 2 * 1000) {
            if (server.nextMap === mapName) {
                logger.info(`${detail.name.substr(0, 20)} 换图完成 当前为${mapPrettyName[mapName]}`);
                server.time = now();
                server.currentMap = mapName;
                server.history[0] = operationIndex[mapName];
                server.lastChangeTime = 0;
                return server;
            } else {
                server.time = now();
                server.currentMap = mapName;
                server.history[0] = operationIndex[mapName];
                server.lastChangeTime = 0;
                throw new Error(`${detail.name.substr(0, 20)} 换图失败,未更换至预期地图 当前为${mapPrettyName[mapName]}`);
            }
        }

        if (mapName === opNextMap[server.currentMap]) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 行动正常轮换,跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }

        try {
            await fetchBF1Api("RSP.chooseLevel", server.account, { persistedGameId: detail.guid, levelIndex: detail.rotation.findIndex(r => r.mapImage.includes(mapid)) });
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap} 更换为 ${mapPrettyName[mapid] || mapid}`);
        } catch (error) {
            if (error.code === -32603) {
                throw new Error(`${detail.name.substr(0, 20)} 无权限更换地图`);
            }
            throw error;
        }

        server.lastChangeTime = now();
        server.currentMap = mapid;
        return server;
    } else {
        // 原本的 RunMode 0 的切图逻辑
        if (server.history[0] !== operationIndex[mapName]) {
            server.history.unshift(operationIndex[mapName]);
        }
        const serverMapList = detail.rotation.map(map => map.mapImage.split("/").pop().split("_").slice(0, 2).join("_"));
        if (server.mode === 0) {
            logger.debug(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 换图功能未启用`);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }
        if (server.minimumPlayer > detail.slots.Soldier.current) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 人数不足,跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }
        if (now() - server.lastChangeTime <= server.skipTime / 2 * 1000) {
            if (server.nextMap === mapName) {
                logger.info(`${detail.name.substr(0, 20)} 换图完成 当前为${mapPrettyName[mapName]}`);
                server.time = now();
                server.currentMap = mapName;
                server.history[0] = operationIndex[mapName];
                server.lastChangeTime = 0;
                return server;
            } else {
                server.time = now();
                server.currentMap = mapName;
                server.history[0] = operationIndex[mapName];
                server.lastChangeTime = 0;
                throw new Error(`${detail.name.substr(0, 20)} 换图失败,未更换至预期地图 当前为${mapPrettyName[mapName]}`);
            }
        }
        if (now() - server.time <= server.skipTime * 1000) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 时间过短(${Math.floor((now() - server.time) / 1000)})s,跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            server.history[0] = operationIndex[mapName];
            return server;
        }
        if (now() - server.time >= 10800 * 1000) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 时间过长(${Math.floor((now() - server.time) / 1000)})s,跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            server.history[0] = operationIndex[mapName];
            return server;
        }
        if (mapName === opNextMap[server.currentMap]) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 行动正常轮换,跳过换图`);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }
        if (typeof operationIndex[mapName] === "number" && typeof operationIndex[server.currentMap] === "number") {
            const currentMap = mapName;
            const oldMap = server.currentMap;
            const currentIndex = serverMapList.indexOf(currentMap);
            const oldIndex = serverMapList.indexOf(oldMap);
            let newIndexS = oldIndex + operaions[operationIndex[oldMap]].length;
            let newIndexO = serverMapList.indexOf(operaions[operationIndex[oldMap]][0]) + operaions[operationIndex[oldMap]].length;
            if (newIndexS >= serverMapList.length) newIndexS = 0;
            if (newIndexO >= serverMapList.length) newIndexO = 0;
            if (currentIndex !== newIndexS && currentIndex !== newIndexO) {
                logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 判断为人工换图,跳过换图`);
                server.time = now();
                server.currentMap = mapName;
                return server;
            }
        }
        if (server.whiteList.includes(operationIndex[mapName]) && operaions.map(i => i[0]).includes(mapName) && (server.history.indexOf(operationIndex[mapName]) === -1 || server.history.indexOf(operationIndex[mapName]) > server.historySkipCount)) {
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 地图符合条件,跳过换图`);
            server.history.unshift(operationIndex[mapName]);
            server.time = now();
            server.currentMap = mapName;
            return server;
        }
        const mapWhiteList = server.whiteList.map(i => operaions[i][0]);
        const serverMapHistory = server.history.map(i => operaions[i][0]);
        const mapToChangeList = shuffle(mapWhiteList.filter(map => serverMapList.includes(map))).sort((a, b) => serverMapHistory.indexOf(a) === -1 ? (serverMapHistory.indexOf(b) === -1 ? 0 : -1) : (serverMapHistory.indexOf(b) === -1 ? 1 : serverMapHistory.indexOf(b) - serverMapHistory.indexOf(a)));
        if (!mapToChangeList.length) {
            server.history.unshift(operationIndex[mapName]);
            server.time = now();
            server.currentMap = mapName;
            throw new Error(`${detail.name.substr(0, 20)} 无地图可更换`);
        }
        const mapToChange = mapToChangeList[0];
        try {
            await fetchBF1Api("RSP.chooseLevel", server.account, { persistedGameId: detail.guid, levelIndex: serverMapList.indexOf(mapToChange) });
            logger.info(`${detail.name.substr(0, 20)} 地图变更 ${mapPrettyName[server.currentMap] || server.currentMap}=>${mapPrettyName[mapName] || mapName} 更换为 ${mapPrettyName[mapToChange] || mapToChange}`);
        } catch (error) {
            if (error.code === -32603) {
                throw new Error(`${detail.name.substr(0, 20)} 无权限更换地图`);
            }
            throw error;
        }
        server.lastChangeTime = now();
        server.nextMap = mapToChange;
        return server;
    }
}

async function fetchBF1Api(method, personaId, params = {}) {
    const baseUrl = "https://sparta-gw.battlelog.com/jsonrpc/pc/api";
    params.game = "tunguska";

    const body = { "jsonrpc": "2.0", "method": method, "params": params, "id": 1 };
    const init = { body: JSON.stringify(body), agent, method: "POST", headers: { "content-type": "application/json" } };

    if (!accounts[personaId]) throw new Error("账号不存在");
    if (accounts[personaId].vaild === false) throw new Warn(`账号${accounts[personaId].name}需要更新Cookie`);
    const sessionId = accounts[personaId].sessionId;
    if (sessionId) { init.headers["X-GatewaySession"] = sessionId; }

    const response = await fetch(baseUrl, init).catch(err => {
        throw new Warn("连接失败");
    });
    const result = await response.json();

    if (result.error) {
        if (result.error.code === -32501) {
            logger.info(`正在更新账号${accounts[personaId].name}`);
            try {
                const { remid, sid, sessionId } = await getSession({ remid: accounts[personaId].remid, sid: accounts[personaId].sid });
                accounts[personaId].remid = remid;
                accounts[personaId].sid = sid;
                accounts[personaId].sessionId = sessionId;
                logger.info(`更新账号${accounts[personaId].name}完成`);
                accounts[personaId].vaild = true;
            } catch (error) {
                accounts[personaId].vaild = false;
                throw error;
            }
            return await fetchBF1Api(method, personaId, params);
        }

        switch (result.error.message) {
            case 'RspErrServerBanMax()':
                throw { name: "GatewayError", message: "服务器Ban已满", code: result.error.code };
            case 'RspErrServerVipMax()':
                throw { name: "GatewayError", message: "服务器VIP已满", code: result.error.code };
            case 'RspErrUserIsAlreadyVip()':
                throw { name: "GatewayError", message: "该玩家已拥有VIP", code: result.error.code };
            case 'ServerNotRestartableException':
                throw { name: "GatewayError", message: "服务器未开启", code: result.error.code };
        }
        switch (result.error.code) {
            case -32501:
                throw { name: "GatewayError", message: "session过期", code: result.error.code };
            case -32602:
                throw { name: "GatewayError", message: "params错误", code: result.error.code };
            case -32603:
                throw { name: "GatewayError", message: "无权限操作", code: result.error.code };
            case -32858:
                throw { name: "GatewayError", message: "服务器未开启", code: result.error.code };
            case -34501:
                throw { name: "GatewayError", message: "找不到服务器", code: result.error.code };
            case -32856:
                if (params.personaName) {
                    throw { name: "GatewayError", message: `玩家${params.personaName}不存在`, code: result.error.code };
                }
                throw { name: "GatewayError", message: "玩家不存在", code: result.error.code };
            default:
                throw { name: "GatewayError", message: "战地接口错误" + result.error.code, code: result.error.code };
        }
    }

    return result.result;
}

async function getSession({ remid, sid } = {}) {
    if (!remid && !sid) throw new Error("未提供Cookie");
    const Cookie = `${remid ? `remid=${remid};` : ''}${sid ? `sid=${sid};` : ''}`;
    let response = await fetch('https://accounts.ea.com/connect/auth?response_type=code&locale=zh_CN&client_id=sparta-backend-as-user-pc&display=junoWeb%2Flogin', {
        redirect: 'manual',
        headers: { "Cookie": Cookie },
        agent
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
    const result = await bf1login(authCode);
    return { remid: remid, sid: sid, sessionId: result.sessionId, personaId: result.personaId };
}

async function bf1login(authCode) {
    const baseUrl = "https://sparta-gw.battlelog.com/jsonrpc/pc/api";
    const method = "Authentication.getEnvIdViaAuthCode";
    const body = {
        "jsonrpc": "2.0",
        "method": method,
        "params": { authCode: authCode },
        "id": 1,
    };
    const init = {
        body: JSON.stringify(body),
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        agent
    };

    const response = await fetch(baseUrl, init);
    const result = await response.json();

    if (result.error) throw new Error('登录失败');

    return result.result;
}

function shuffle(array) {
    let m = array.length, t, i;
    while (m) {
        i = Math.floor(Math.random() * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}

class Warn extends Error {
    constructor(message) {
        super(message);
        this.name = "Warn";
    }
}

scheduleJob('0,30 * * * * *', async (time) => {
    const reqs = servers.map(server => 
        changeMap(server)
            .then(result => {
                logger.info('玩家场次已检测');
            })
            .catch(err => {
                if (err.name === "Error") {
                    logger.error(err.message);
                    return;
                }
                if (err.name === "Warn") {
                    logger.warn(err.message);
                    return;
                }
                logger.error(err);
            })
    );
    await Promise.allSettled(reqs);
    fs.writeFileSync(path.join(__dirname, "./profile/server.json"), JSON.stringify(servers));
    fs.writeFileSync(path.join(__dirname, "./profile/account.json"), JSON.stringify(accounts));
});
