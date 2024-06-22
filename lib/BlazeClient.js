import { BlazeSocket } from "./blaze.js";

export class BlazeClient {
    #socket; #getAuthCode; #queue = {}; #ready = false; #loginFailCallback
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
        this.#socket?.destroy?.()
        this.#socket = new BlazeSocket()
        const authCode = this.#getAuthCode.constructor.name === "AsyncFunction" ?
            await this.#getAuthCode() : this.#getAuthCode()
        console.log(`Blaze Login`)
        await this.#socket.send({ "method": "Authentication.login", "data": { "AUTH 1": authCode, "EXTB 2": "", "EXTI 0": 0 } })
        this.#ready = true
        Object.getOwnPropertySymbols(this.#queue).forEach(symbol => {
            this.send(this.#queue[symbol])
            delete this.#queue[symbol]
        })
    }
    /**
     * @param {object} option 设置
     * @param {string} option.method 方法名
     * @param {object} option.data 参数
     */
    send({ method, data, resolve: res, reject: rej }) {
        return new Promise((resolve, reject) => {
            const symbol = Symbol(method)
            this.#queue[symbol] = { method, data, resolve: res ?? resolve, reject: rej ?? reject }
            if (!this.#ready) return
            this.#socket.send({ method, data })
                .then(result => {
                    if (!result.error) {
                        this.#queue[symbol]?.resolve(result)
                        delete this.#queue[symbol]
                    } else if (result.error.message === "ERR_AUTHENTICATION_REQUIRED") {
                        this.login().catch(err => this.#loginFailCallback?.(err))
                    } else {
                        this.#queue[symbol]?.reject(result.error)
                        delete this.#queue[symbol]
                    }
                })
        })
    }
}