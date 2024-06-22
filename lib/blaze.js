import { Components, Commands, Methods, Errors } from "./Method.js"
import tls from "tls"

/*
    Blaze包解析
    一个Blaze包的前16字节为报头, 后面为报文
    报文部分是一个BlazeStruct
    超过16kb的包会被拆分, 每个16kb

    PacketHeader
    00 0f 6f c3 00 00 00 04 00 67 00 00 02 20 00 00
    -----1----- --2-- --3-- --4-- 5- --6-- 7- --8--
    1. Length - 报文长度
    2. Empty - 空
    3. Component - 组件
    4. Command - 命令
    5. Empty - 空
    6. Id - 包ID(原样返回)
    7. PacketType - 包类型
    8. Empty - 空

    PacketType
    00 - SendCommand
    20 - Result
    40 - ReceiveMessage
    80 - SendKeepAlive
    A0 - ReceiveKeepAlive
    注: KeepAlive包是一个PacketType为80的空包, 每分钟发一次

    BlazeStruct
    读三个字节, 解析为TAG
    读一个字节, 作为[Type]
    以[Type]为类型读一个值
    TAG-Type-Value作为一个Element
    重复以上步骤读取Element, 直到遇到00或文件尾

    Type
    00 Integer
    01 String
    02 Blob
    03 Struct
    04 List
    05 Map
    06 Union
    07 IntList
    08 Double
    09 Tripple
    0A Float

    BlazeInteger
       8E       85       E3       0B
    10001110 10000101 11100011 00001011
    每个字节的第一位表示是否还有下一个字节
    每个字节后七位连接起来就是数值
    数值的第一位表示正负

    BlazeString
    读一个BlazeInteger作为[Length], 然后读[Length]个字节作为字符串

    BlazeBlob
    读一个BlazeInteger作为[Length], 然后读[Length]个字节并存储

    BlazeList
    读一个字节, 作为[Type]
    读一个BlazeInteger作为[Size]
    以[Type]为类型读[Size]个值

    BlazeMap
    读一个字节, 作为[KeyType]
    读一个字节, 作为[ValueType]
    读一个BlazeInteger作为[Size]
    以[KeyType]读取一次作为键
    以[ValueType]读取一次作为值
    重复以上两步, 读取[Size]个键值对

    BlazeUnion
    读一个字节, 作为[UnionType]
    若[UnionType]为FF, 则Union为空
    若不为FF, 则读一个Element作为值

    BlazeIntList
    读一个BlazeInteger作为[Size]
    读[Size]个BlazeInteger作为列表

    BlazeDouble
    读两个BlazeInteger作为Double

    BlazeTripple
    读三个BlazeInteger作为Tripple

    BlazeFloat
    读一个Float(四字节)

    TAG Decompression
    三个字节的TAG
    > D2 5C F4
    > 11010010 01011100 11110100
    将三个八位的字节分成四个六位的字节
    > 110100 100101 110011 110100
    每个字节加32(100000)
    > 1010100 1000101 1010011 1010100
    > 54 45 53 54
    转换为四个ASCII字符
    > TEST
*/

const BlazeType = {
    "0": "Integer",
    "1": "String",
    "2": "Blob",
    "3": "Struct",
    "4": "List",
    "5": "Map",
    "6": "Union",
    "7": "IntList",
    "8": "Double",
    "9": "Tripple",
    "10": "Float"
}

const PacketType = {
    "0": "SendCommand",
    "32": "Result",
    "64": "ReceiveMessage",
    "128": "SendKeepAlive",
    "160": "ReceiveKeepAlive",
    "SendCommand": 0,
    "Result": 32,
    "ReceiveMessage": 64,
    "SendKeepAlive": 128,
    "ReceiveKeepAlive": 160
}

const TypeCategory = {
    "SendCommand": "Command",
    "Result": "Command",
    "ReceiveMessage": "Message",
    "SendKeepAlive": "KeepAlive",
    "ReceiveKeepAlive": "KeepAlive"
}

const keepalive = Buffer.from("00000000000000000000000000800000", "hex")

const tags = new Map()

export class Blaze {
    static decode(buffer) {
        let offset = 16
        const length = buffer.readInt32BE(0)
        const type = PacketType[buffer[13]] || buffer[13]
        const component = buffer.readInt16BE(6)
        const command = buffer.readInt16BE(8)
        const id = buffer.readInt16BE(11)
        let method
        if (TypeCategory[type] === "KeepAlive") {
            method = "KeepAlive"
        } else {
            method = (Components[component] || component) + "." + (Components[component] && Commands[Components[component]][TypeCategory[type] || "Command"] && Commands[Components[component]][TypeCategory[type] || "Command"][command] || command)
        }
        const data = parseStruct()
        if (data['ERRC 0']) {
            const component = data['ERRC 0'] & 0xFFFF
            let code = data['ERRC 0'] >> 16
            if (code >= 16384) code -= 16384
            const error = new BlazeError(Errors[`${component}.${code}`] || { component: Components[component] || component, name: code })
            return { method, type, id, length, error }
        } else {
            return { method, type, id, length, data }
        }

        function parseBlock(type, header) {
            let value
            switch (BlazeType[type]) {
                case "Integer": {
                    value = parseInteger()
                    break
                }
                case "String": {
                    value = parseString()
                    break
                }
                case "Struct": {
                    value = parseStruct()
                    break
                }
                case "Blob": {
                    value = parseBlob()
                    break
                }
                case "List": {
                    value = parseList(header)
                    break
                }
                case "Map": {
                    value = parseMap(header)
                    break
                }
                case "Union": {
                    value = parseUnion(header)
                    break
                }
                case "Double": {
                    value = parseDouble()
                    break
                }
                case "Tripple": {
                    value = parseTripple()
                    break
                }
                case "IntList": {
                    value = parseIntList()
                    break
                }
                case "Float": {
                    value = parseFloat()
                    break
                }
                default: {
                    throw new Error("未知类型")
                }
            }
            return value
        }

        function parseStruct() {
            const data = {}
            while (buffer[offset]) {
                const header = {
                    tag: decodeTag(buffer.slice(offset, offset += 3).toString("hex")),
                    type: buffer[offset++]
                }
                const result = parseBlock(header.type, header)
                data[`${header.tag.padEnd(4, " ")} ${header.type.toString(16)}`] = result
            }
            offset++
            return data
        }

        function parseUnion(header) {
            const data = {}
            const unionType = buffer[offset++]
            if (unionType === 127) return data
            header.type += unionType.toString(16)
            const uHeader = {
                tag: decodeTag(buffer.slice(offset, offset += 3).toString("hex")),
                type: buffer[offset++]
            }
            const result = parseBlock(uHeader.type, uHeader)
            data[`${uHeader.tag.padEnd(4, " ")} ${uHeader.type}`] = result
            return data
        }

        function parseInteger() {
            let i = 1, n = buffer[offset++], negative = n & 64
            if (n & 128) {
                n = n & 127
                do {
                    n += (buffer[offset] & 127) * (128 ** i++ * 0.5)
                } while (buffer[offset++] > 127)
            }
            if (negative) return -n
            return n
        }

        function parseString() {
            const length = parseInteger()
            return buffer.slice(offset, (offset += length) - 1).toString()
        }

        function parseBlob() {
            const length = parseInteger()
            return buffer.slice(offset, (offset += length) - 1).toString("hex")
        }

        function parseList(header) {
            const type = buffer[offset++]
            header.type += type.toString(16)
            const size = parseInteger()
            const data = []
            if (type === 3 && buffer[offset] === 2) {
                header.type += "2"
                offset++
            }
            for (let i = 0; i < size; i++) {
                data.push(parseBlock(type))
            }
            return data
        }

        function parseIntList() {
            const size = parseInteger()
            const data = []
            for (let i = 0; i < size; i++) {
                data.push(parseInteger())
            }
            return data
        }

        function parseMap(header) {
            const keyType = buffer[offset++]
            const valType = buffer[offset++]
            header.type += keyType.toString(16) + valType.toString(16)
            const size = parseInteger()
            const data = {}
            for (let i = 0; i < size; i++) {
                data[parseBlock(keyType)] = parseBlock(valType)
            }
            return data
        }

        function parseDouble() {
            const data = [parseInteger(), parseInteger()]
            return data
        }

        function parseTripple() {
            const data = [parseInteger(), parseInteger(), parseInteger()]
            return data
        }

        function parseFloat() {
            return buffer.readFloatBE((offset += 4) - 4)
        }

        function decodeTag(hex) {
            if (tags.has(hex)) return tags.get(hex)
            const buffer = Buffer.alloc(4)

            buffer[0] = (parseInt(hex, 16) >> 18 & 63) + 32
            buffer[1] = (parseInt(hex, 16) >> 12 & 63) + 32
            buffer[2] = (parseInt(hex, 16) >> 6 & 63) + 32
            buffer[3] = (parseInt(hex, 16) >> 0 & 63) + 32

            const tag = buffer.toString()
            tags.set(hex, tag)
            return tag
        }
    }
    static encode(packet) {
        const header = Buffer.alloc(16)
        // Component
        header.writeUInt16BE(Methods[packet.method]?.[0] || +packet.method.split(".")[0], 6)
        // Command
        header.writeUInt16BE(Methods[packet.method]?.[1] || +packet.method.split(".")[1], 8)
        // Id
        header.writeUInt16BE(packet.id, 11)
        // Type
        header[13] = PacketType[packet.type] || 0

        let hex = ""
        writeStruct(packet.data || {}, false)
        const data = Buffer.from(hex, "hex")
        // Length
        header.writeUInt32BE(data.length, 0)

        return Buffer.concat([header, data])

        function writeBlock(type, value, key) {
            switch (BlazeType[parseInt(type, 16)]) {
                case "Integer": {
                    value = writeInteger(value)
                    break
                }
                case "String": {
                    value = writeString(value)
                    break
                }
                case "Struct": {
                    value = writeStruct(value)
                    break
                }
                case "Blob": {
                    value = writeBlob(value)
                    break
                }
                case "List": {
                    value = writeList(value, key)
                    break
                }
                case "Map": {
                    value = writeMap(value, key)
                    break
                }
                case "Union": {
                    value = writeUnion(value, key)
                    break
                }
                case "Double": {
                    value = writeDouble(value)
                    break
                }
                case "Tripple": {
                    value = writeTripple(value)
                    break
                }
                case "IntList": {
                    value = writeIntList(value)
                    break
                }
                case "Float": {
                    value = writeFloat(value)
                    break
                }
                default: {
                    throw new Error(`Unknown Type` + type)
                }
            }
        }

        function writeStruct(object, end = true) {
            Object.entries(object).forEach(({ 0: key, 1: value }) => {
                hex += encodeTag(key.slice(0, 4)) //tag
                hex += "0" + key[5] //type
                writeBlock(key[5], value, key)
            })
            if (end) hex += "00"
        }

        function writeInteger(n) {
            let negative = false
            n = +n
            if (n < 0) { negative = true; n = -n }
            const temp = []
            temp.push(n % 64 + 128)
            n = Math.floor(n / 64)
            while (n > 0) {
                temp.push(n % 128 + 128)
                n = Math.floor(n / 128)
            }
            if (negative) temp[0] += 64
            temp[temp.length - 1] -= 128
            hex += Buffer.from(temp).toString("hex")
        }

        function writeString(text) {
            if (!text) {
                hex += "0100"
                return
            }
            text = Buffer.from(text).toString("hex") + "00"
            writeInteger(text.length / 2) //length
            hex += text
        }

        function writeBlob(blobHex) {
            writeInteger(blobHex.length / 2)
            hex += blobHex
        }

        function writeList(list, key) {
            hex += "0" + key[6]
            writeInteger(list.length) //size
            list.forEach(item => writeBlock(key[6], item))
        }

        function writeMap(map, key) {
            map = Object.entries(map)
            hex += "0" + key[6]
            hex += "0" + key[7]
            writeInteger(map.length) //size
            map.forEach(({ 0: k, 1: value }) => {
                writeBlock(key[6], k)
                writeBlock(key[7], value)
            })
        }

        function writeIntList(list) {
            writeInteger(list.length) //size
            list.forEach(item => writeInteger(item))
        }

        function writeUnion(data, key) {
            if (key[6]) {
                hex += "0" + key[6]
                writeStruct(data, false)
            } else {
                hex += "7f"
            }
        }

        function writeDouble(list) {
            writeInteger(list[0])
            writeInteger(list[1])
        }

        function writeTripple(list) {
            writeInteger(list[0])
            writeInteger(list[1])
            writeInteger(list[2])
        }

        function writeFloat(item) {
            const buff = Buffer.alloc(4)
            buff.writeFloatBE(item)
            hex += buff.toString("hex")
        }

        function encodeTag(tag) {
            if (tags.has(tag)) return tags.get(tag)
            let buffer = 0

            for (let i in tag) {
                buffer += ((parseInt(Buffer.from(tag[i]).toString("hex"), 16) - 32) << (18 - 6 * i))
            }

            const hex = buffer.toString(16)
            tags.set(tag, hex)
            return hex
        }
    }
}

export class BlazeSocket {
    #connect = true
    #finish = true
    #map = new Map()
    #id = 1
    #temp = {}
    #callback
    socket
    #stream
    constructor(callback) {
        this.#callback = callback
        this.socket = tls.connect({ host: "diceprodblapp-08.ea.com", port: "10363", rejectUnauthorized: false }, () => {
            setInterval(() => {
                this.socket.write(keepalive)
            }, 30000)
        })
        this.socket.on("data", data => { this.#concat.call(this, data) })
        this.socket.on("end", () => this.#connect = false)
        this.socket.on("close", () => this.#connect = false)
    }
    close() {
        this.#connect = false
        this.socket.end()
    }
    send(packet) {
        if (!this.#connect) throw new Error("Connection Closed")
        if (this.#id > 65535) this.#id = 1
        return new Promise(resolve => {
            this.#map.set(this.#id, resolve)
            packet.id = this.#id++
            this.#request(packet)
        })
    }
    #request(packet) {
        if (!this.#connect) throw new Error("Connection Closed")
        this.socket.write(Blaze.encode(packet))
    }
    #response(packet) {
        if (this.#callback) {
            this.#callback(packet)
        }
        if (packet.method === "KeepAlive") return
        if (!this.#stream && this.#map.has(packet.id)) {
            this.#map.get(packet.id)(packet)
            this.#map.delete(packet.id)
        }
    }
    #concat(buffer) {
        // this.#temp2.push(buffer)
        // if (buffer.length < 16384) {
        //     const data = Buffer.concat(this.#temp2)
        //     console.log(data)
        //     this.#temp2 = []
        //     this.#response(Blaze.decode(data))
        // }

        if (this.#finish) {
            const header = Blaze.decode(buffer.slice(0, 16))
            if (buffer.length - 16 < header.length) {
                this.#temp.data = Buffer.alloc(header.length + 16)
                this.#temp.length = buffer.length
                this.#temp.origin = header.length + 16
                this.#finish = false
                buffer.copy(this.#temp.data)
            } else {
                this.#response(Blaze.decode(buffer))
                this.#temp = {}
            }
        } else {
            if (this.#temp.length >= this.#temp.origin) {
                //超长了
                this.#finish = true
                this.#temp = {}
            } else {
                buffer.copy(this.#temp.data, this.#temp.length)
                this.#temp.length += buffer.length
                if (this.#temp.length >= this.#temp.origin) {
                    this.#finish = true
                    this.#response(Blaze.decode(this.#temp.data))
                    this.#temp = {}
                }
            }
        }
    }
}

export class BlazeError extends Error {
    constructor({ component, name, description, details }) {
        super(name)
        this.name = "BlazeError"
        this.component = component
        if (description) this.description = description
        if (details) this.details = details
    }
}