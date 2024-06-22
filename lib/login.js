import fetch from "node-fetch";

class EA {
    static async getGatewayAuthCode({ remid, sid }) {
        if (!remid && !sid) throw new Error("未提供Cookie")
        const Cookie = `${remid ? `remid=${remid};` : ''}${sid ? `sid=${sid};` : ''}`
        let response = await fetch('https://accounts.ea.com/connect/auth?response_type=code&locale=zh_CN&client_id=sparta-backend-as-user-pc&display=junoWeb%2Flogin', {
            redirect: 'manual',
            headers: { "Cookie": Cookie }
        })
        const location = response.headers.get('location')
        if (location.match("fid=")) throw new Error("Cookie失效")
        if (location.match("error_code=user_status_invalid")) throw new Error("账号已被封禁")
        const authCode = location.replace(/.*code=(.*)/, '$1')
        const newCookie = response.headers.get('set-cookie').split(/\s+/)
        if (newCookie.find(item => item.match(/^sid=/))) {
            sid = newCookie.find(item => item.match(/^sid=/)).replace(/sid=(.*?);/, '$1')
        }
        if (newCookie.find(item => item.match(/^remid=/))) {
            remid = newCookie.find(item => item.match(/^remid=/)).replace(/remid=(.*?);/, '$1')
        }
        return { remid, sid, authCode }
    }
    static async getBlazeAuthCode({ remid, sid }) {
        if (!remid && !sid) throw new Error("未提供Cookie")
        const Cookie = `${remid ? `remid=${remid};` : ''}${sid ? `sid=${sid};` : ''}`
        let response = await fetch('https://accounts.ea.com/connect/auth?client_id=GOS-BlazeServer-BFTUN-PC&response_type=code&prompt=none', {
            redirect: 'manual',
            headers: { "Cookie": Cookie }
        })
        const location = response.headers.get('location')
        if (location.match("fid=")) throw new Error("Cookie失效")
        if (location.match("error_code=user_status_invalid")) throw new Error("账号已被封禁")
        const authCode = location.replace(/.*code=(.*)/, '$1')
        const newCookie = response.headers.get('set-cookie').split(/\s+/)
        if (newCookie.find(item => item.match(/^sid=/))) {
            sid = newCookie.find(item => item.match(/^sid=/)).replace(/sid=(.*?);/, '$1')
        }
        if (newCookie.find(item => item.match(/^remid=/))) {
            remid = newCookie.find(item => item.match(/^remid=/)).replace(/remid=(.*?);/, '$1')
        }
        return { remid, sid, authCode }
    }
}

const { getBlazeAuthCode, getGatewayAuthCode } = EA
export { getBlazeAuthCode, getGatewayAuthCode }