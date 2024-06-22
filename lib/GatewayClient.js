import fetch from "node-fetch";
import { randomUUID } from "crypto";
const baseUrl = "https://sparta-gw-bf1.battlelog.com/jsonrpc/pc/api"

export class GatewayClient {
    #sessionId; #getAuthCode; #queue = {}; #ready = false; #loginFailCallback
    /**
     * @param {object} option 设置
     * @param {Function} option.getAuthCode 获取验证码的函数
     * @param {Function} option.loginFail 登录失败回调
     */
    constructor({ getAuthCode, loginFail } = {}) {
        if (!getAuthCode) throw new Error("未提供获取验证码的函数")
        this.#getAuthCode = getAuthCode
        this.#loginFailCallback = loginFail
    }
    async login() {
        this.#ready = false
        const authCode = this.#getAuthCode.constructor.name === "AsyncFunction" ?
            await this.#getAuthCode() : this.#getAuthCode()
        console.log(`Gateway Login`)
        const { sessionId } = await GatewayClient.gatewayRequest({ method: "Authentication.getEnvIdViaAuthCode", params: { authCode, "locale": "zh-tw" } })
        this.#sessionId = sessionId
        this.#ready = true
        Object.getOwnPropertySymbols(this.#queue).forEach(symbol => {
            this.send(this.#queue[symbol])
            delete this.#queue[symbol]
        })
    }
    /**
     * @param {object} option 设置
     * @param {string} option.method 方法名
     * @param {object} option.params 参数
     */
    send({ method, params, resolve: res, reject: rej }) {
        return new Promise((resolve, reject) => {
            const symbol = Symbol(method)
            this.#queue[symbol] = { method, params, resolve: res ?? resolve, reject: rej ?? reject }
            if (!this.#ready) return
            GatewayClient.gatewayRequest({ method, params, sessionId: this.#sessionId })
                .then(result => {
                    this.#queue[symbol]?.resolve(result)
                    delete this.#queue[symbol]
                })
                .catch(error => {
                    if (error.error?.code === -32501) {
                        this.login().catch(err => this.#loginFailCallback?.(err))
                    } else {
                        this.#queue[symbol]?.reject(error)
                        delete this.#queue[symbol]
                    }
                })
        })
    }
    static async gatewayRequest({ sessionId, method, params = {} }) {
        const body = { "jsonrpc": "2.0", "method": method, "params": Object.assign(params, { game: "tunguska" }), "id": randomUUID() }
        const init = { body: JSON.stringify(body), method: "POST", headers: { "content-type": "application/json", "X-GatewaySession": sessionId } }
        const response = await fetch(baseUrl, init).then(response => response.json().catch(error => {
            throw error
        })).catch(error => {
            if (error.name === "FetchError" || error.message === "TIMEOUT") throw new GatewayError("网络连接失败")
            throw error
        })
        if (response.error) {
            throw new GatewayError(response.error, method)
        } else {
            return response.result
        }
    }
}

class GatewayError extends Error {
    /**
     * @param {string} error 错误消息/错误体
     * @param {number=} code 错误代码
     */
    constructor(error, method) {
        if (typeof error === "object") {
            super(getErrorMessage())
            this.name = "GatewayError";
            error.method = method
            this.error = error
            function getErrorMessage() {
                const code = error.code
                const message = error.message
                if (code === -32501)
                    return 'Session失效'
                if (code === -32504)
                    return '网络连接超时(后端)'

                if (code === -34501)
                    return '找不到服务器'
                if (code === -34504)
                    return '连接超时(后端)'

                if (code === -32601)
                    return '方法不存在'

                if (code === -32602) {
                    if (message.match('malformed'))
                        return '请求参数格式错误'
                    if (message.match('missing'))
                        return '请求缺少参数'
                    if (message.match('method expected session'))
                        return 'Session失效'
                    return '请求参数错误'
                }

                if (code === -35150 && method === "Platoons.getPlatoon")
                    return '战队不存在'

                if (code === -35160)
                    return '无权限进行此操作'

                if (code === -32603) {
                    switch (method) {
                        case "RSP.chooseLevel":
                            return '账号不是管理员'
                        case "RSP.kickPlayer":
                            return '无法踢出管理员/机器人不是管理员'
                        case "RSP.getServerDetails":
                            return '机器人不是管理员'
                        case "Authentication.getEnvIdViaAuthCode":
                            return '登录失败'
                    }
                    if (message === "Internal Error: java.lang.NumberFormatException")
                        return '数字格式化错误'
                    if (message === "Internal Error: org.apache.thrift.TApplicationException")
                        return '无权限进行此操作'
                    if (message === "Internal Error: java.lang.IllegalArgumentException")
                        return '非法的参数'
                    if (message === "Internal Error: java.lang.NullPointerException")
                        return '空指针'
                    if (message === "Authentication failed")
                        return '验证失败'
                    if (message.match("ERR_AUTHENTICATION_REQUIRED"))
                        return '无权限进行此操作'
                    if (message.match("Error: InvalidServerNameException"))
                        return '服务器名无效'
                    if (message.match("com.fasterxml.jackson.core.JsonParseException"))
                        return 'JSON解析失败'
                    if (message.match("RspErrInvalidMapRotationId()"))
                        return '地图组不存在'
                    if (message.match("errorName: ERR_SYSTEM"))
                        return '系统错误'
                    if (message.match("java"))
                        return '未知服务端错误(java)'
                    if (message.match("apache"))
                        return '未知服务端错误(apache)'
                    if (message.match("Timeout"))
                        return 'blaze超时'
                    if (message.match("WalBlazeError") || message.match("BlazeErrorException"))
                        return '未知服务端错误(blaze)'
                    return '未知服务端错误'
                }

                if (message === "ServerNotRestartableException")
                    return '服务器未开启'
                if (message === "RspErrServerBanMax()")
                    return '服务器Ban已满'
                if (message === "RspErrServerVipMax()")
                    return '服务器VIP已满'
                if (message === "InvalidLevelIndexException")
                    return '地图编号无效'
                if (message === "RspErrUserIsAlreadyVip()")
                    return '玩家已经是VIP了'
                if (message === "InvalidServerIdException") //-32855
                    return '服务器ID不存在'

                if (code === -32851)
                    return '服务器不存在/已过期'
                if (code === -32856)
                    return '玩家不存在'
                if (code === -32857)
                    return '无法处置管理员'
                logger.error(`未知的接口错误`, error)
                return `未知的接口错误`
            }
        } else {
            super(error);
            this.name = "GatewayError";
        }
    }
}