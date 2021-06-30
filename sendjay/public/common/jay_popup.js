let g_type, g_path, g_msgid, g_body, g_added
let g_videoTab

const play = () => {
    g_videoTab.attr("src", hush.cons.route + "/proc_file/" + g_path + "?msgid=" + g_msgid)
}

const fileDownload = () => {
    $("#fileDownload").show()
    location.href = "/proc_file/" + g_path + "?msgid=" + g_msgid
}

const previewImage = async () => {            
    const imageBody = $("#imgbody")
    const image = $("#img")
    let rq = { msgid : g_msgid, body : g_body }
    const rs = await hush.http.ajax(hush.cons.route + "/get_msginfo", rq)
    imageBody.show()
    if (rs.code == hush.cons.result_ok) {
        image.attr("src", hush.http.getBlobUrlForImage(rs.buffer.data)) //image.attr("src", hush.http.addPrefixForBlobUrl() + rs.bufferStr)
        image.on("load", function() {
            if (this.naturalWidth > screen.width || this.naturalHeight > screen.height) {
                if (this.naturalWidth > this.naturalHeight) {
                    image.width(screen.width)
                    image.height(this.naturalHeight * screen.width / this.naturalWidth)
                } else {
                    image.height(screen.height)
                    image.width(this.naturalWidth * screen.height / this.naturalHeight)
                }
            }
        })
    } else {
        imageBody.html("Error: " + rs.msg + " (" + rs.code + ")")
    }
}

var funcSockEv = { //needs to be public
    [hush.cons.sock_ev_disconnect] : (data) => { },
    [hush.cons.sock_ev_mark_as_connect] : (data) => { },
    [hush.cons.sock_ev_connect] : (data) => { }
}

////////////////////////////////////////////////////////////////////////mobile webview
const startFromWebView = (from, obj, rs) => {
    try {
        hush.auth.setCookieForUser(obj, "Y", true)
        hush.user = hush.auth.setUser()
        g_added = rs
        if (g_type == "play") {
            play()
        } else if (g_type == "image" || g_type == "ext_image") {
           previewImage()
        }
    } catch (ex) {
        hush.msg.alert("startFromWebView: " + ex.message)
    }
}

const getFromWebViewSocket = (from, json) => {
    try {
        if (!funcSockEv || !funcSockEv[json.ev]) return //Every event data object comes here which is not defined in this page. 
        funcSockEv[json.ev].call(null, json.data)
    } catch (ex) {
        hush.msg.alert("popup:getFromWebViewSocket: (" + JSON.stringify(json) + ")\n" + ex.message)
    }
}

const save = () => {
    $("#btn_save").click()
}
////////////////////////////////////////////////////////////////////////
