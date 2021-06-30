var g_type, g_roomid, g_origin, g_userkey, g_userid, g_usernm, g_token10 //var => also referred in child window popup
let g_list_msg, g_in_chat, g_year, g_self = this
let g_masterid, g_title, g_socket, g_inviteWin
let g_page, g_cdt, g_imgPromiseArr, g_stopAutoScrollDown
let g_msgUnread = [], g_focus_for_webview, g_show_list_people = "X", sockConnected = false
const FIRST_QUERIED = "9999"

const resetEnvForScroll = () => {
    g_cdt = FIRST_QUERIED //FIRST_QUERIED(default). YYYYMMDD~ : when scrolled all the way down to the bottom, previous page shown and g_cdt gets YYYYMMDD~ value
}

const procScrollEvent = () => {
    resetEnvForScroll()
    g_list_msg.scroll(_.debounce(function() { //_.debounce => lodash.min.js
        setTimeout(() => procQueryUnread(), 1)
        //When scrolled down to the bottom, txt_msg_added has to be clicked. 스크롤이 맨 아래로 오면 txt_msg_added 있을 때 클릭한 효과와 동일해야 함
        //const _lastTag = $($(".talk").last()[0]); if (_lastTag.position().top + _lastTag.height() + 1 <= g_list_msg.height()) {
        if (g_list_msg.prop("scrollHeight") - parseInt(g_list_msg.height()) - g_list_msg.scrollTop() <= 100) {	
            const _tag = $("#txt_msg_added")
            if (_tag.css("display") != "none") _tag.click()
        } else {                    
            if (g_stopAutoScrollDown == null) g_stopAutoScrollDown = true
        }        
        const getMore = $("#getmore")
        if (!getMore || getMore.length == 0) return
        if (getMore.position().top + getMore.height() > 0) { //g_list_msg position should be relative for checking position().top
            if (getMore.attr("getting") == "Y") return
            getMore.attr("getting", "Y")
            setTimeout(() => getMsgList(), 100)
        }
    }, 150))
}

const scrollToTarget = (_target) => {
    if (_target == 0) { //scroll to top
        g_list_msg.scrollTop(0)
    } else if (_target) { //ie) ".more"
        if ($(_target).length > 0) g_list_msg.scrollTop($(_target).position().top)
    } else { //scroll to bottom
        g_list_msg.scrollTop(g_list_msg.prop("scrollHeight"))
    }
}

const showImgMenu = (show) => {
    if (!hush.webview.on) {
        if (show) {
            $("#imgplate").show()
            $(".chat").hide()
            $(".img").show()                
            $(".cell").hide()                
        } else {
            $("#imgplate").hide()
            $("#imgplate").empty()
            $(".chat").show()    
            $(".img").hide()
            $(".cell").hide()
        }
    } else {
        if (show) {
            $("#send_copy, #cancel_copy").hide()
            $("#imgplate, #btn_send_img_m, #btn_cancel_img_m").show()
        } else {
            $("#imgplate, #btn_send_img_m, #btn_cancel_img_m").hide() 
            $("#send_copy, #cancel_copy").show()
            $("#imgplate").empty()
        }
    }
}

const showCellMenu = (show, obj) => {
    $(".chkboxSel").prop("checked", false)
    if (show) {
        $(".chat").hide()
        $(".img").hide()
        $(".cell").show()
        $(".chkboxSel").show()
        $("#sel_" + obj.msgid).prop("checked", true)
        $("#sel_info").show()
        const len = $(".chkboxSel:checked").length
        $("#cnt_sel").html(len)
        showRoomMenu(true)        
    } else {
        $(".chat").show()
        $(".img").hide()
        $(".cell").hide()
        $(".chkboxSel").hide()
        $("#sel_info").hide()
        showRoomMenu(false)
    }
}

const updateAllUnreads = (first_queried) => { //first_queried is dummy for prevent two times call of read_msg(query) event in 'updateall' and scroll event.
    const rq = { type : "updateall", senderkey : g_userkey, receiverid : g_userid, roomid : g_roomid, first_queried : first_queried }
    if (hush.webview.ios) { 
    } else if (hush.webview.and) {
        AndroidCom.send(hush.cons.sock_ev_read_msg, JSON.stringify(rq), g_roomid, "parent", false) //procMsg=false
    } else {
        hush.sock.send(g_socket, hush.cons.sock_ev_read_msg, rq, g_roomid, "parent")
    }
}

const setMembers = async (data) => {            
    try {
        g_masterid = data.masterid
        g_title = hush.room.getRoomName(data.nicknm, data.mainnm, data.roomnm)
        document.title = g_title + " - " + hush.cons.title
        const list = $("#people_sub")
        list.empty()                
        const rq = { type : "userids", keyword : data.receiverid.join(hush.cons.indeli) }
        const rs = await hush.http.ajax(hush.cons.route + "/qry_userlist", rq)
        if (rs.code != hush.cons.result_ok) {
            hush.msg.toast(rs.msg)
            return
        }
        const _len = rs.list.length
        for (let i = 0; i < _len; i++) {
            const row = rs.list[i]
            const _userid = row.USER_ID
            const w_userkey = hush.cons.w_key + _userid
            const m_userkey = hush.cons.m_key + _userid
            const _unregistered = row.DEL_DATE ? " - unregistered" : ""
            const _nm = (row.JOB ? row.USER_NM + " / " + row.JOB : row.USER_NM) + _unregistered
            const _abcd = row.AB_CD.toLowerCase()
            const _abnm = row.AB_NM
            const push_ios = row.PUSH_IOS
            const push_and = row.PUSH_AND
            const state_mob = (push_ios && push_ios != hush.cons.invalid_push_token) || (push_and && push_and != hush.cons.invalid_push_token) ? "coStateMob mobInstalled" : "coStateOff"
            let _html = "<div id=div_" + _userid + " class=mem data-nm='" + _nm + "' data-usernm='" + row.USER_NM + "' data-abnm='" + _abnm + "' style='cursor:pointer'>"
            _html += "      <div style='height:18px;display:flex;align-items:center;margin-left:2px'>"
            _html += "          <div style='white-space:nowrap;overflow:hidden'>"
            _html += "              <span id=w_" + w_userkey + " class=coStateOff>W</span>"
            _html += "              <span id=m_" + m_userkey + " class='" + state_mob + "'>M</span>"
            _html += "              <span id=abcd_" + _userid + " class=coStateOut style='display:none'>" + _abcd + "</span>"
            _html += "              <span id=typing_" + _userid + " style='display:none;font-size:11px;color:red'>typing</span>"
            _html += "          </div>"
            _html += "      </div>"
            const _master = (g_masterid == _userid) ? ";font-weight:bold" : ""
            _html += "      <div class=coDotDot style='height:20px;color:#005192;font-size:14px;margin-left:2px" + _master + "'>" + _nm + "</div>"
            _html += "   </div>"
            list.append(_html)
            if (_abcd) $("#abcd_" + _userid).show()
        }                
        $("#people_cnt").html(_len)
        $(".mem").off("click").on("click", function() {
            const _userid = this.id.substring(4)
            const _abnm = $(this).data("abnm") ? ": " + $(this).data("abnm") : ""
            const _usernm = $(this).data("nm")
            let _html = "<img id=img_userid src='/img/noperson.png' style='width:64px;height:64px'>"
            _html += "<span style='margin-left:5px'>" + _usernm + _abnm + "</span>"
            hush.msg.alert(_html, { 
                "Get talks": function() { 
                    hush.msg.close()
                    g_list_msg.empty()
                    resetEnvForScroll() //should be preceded getMsgList()
                    $("#btn_close_search").show()
                    getMsgList("onlyone", _userid)
                }, "Make leave": function() { 
                    hush.msg.close()
                    const rq = initMsg()
                    rq.type = "leave"
                    rq.reply = _userid
                    rq.body = _usernm + "<br>" + hush.cons.left
                    if (hush.webview.ios) {
                    } else if (hush.webview.and) {
                        AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rq), g_roomid, "parent", true) //procMsg=true
                    } else {
                        hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rq, g_roomid, "parent")
                    }
                }, "Close": function() { 
                    hush.msg.close()
                } 
            }, "Info", 320)
            hush.http.getUserPic(_userid, "img_userid")
        })
        if (!data.userkeys) return
        const dataObj = { userkeys : data.userkeys }
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_chk_alive_simple, JSON.stringify(dataObj), g_roomid, null, false) //procMsg=false
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_chk_alive_simple, dataObj, g_roomid)
        }
    } catch (ex) {
        hush.msg.alert("setMembers: " + ex.message)
    }
}

const setResult = (data) => {            
    try {
        const list = $("#result_sub")
        list.append("<div id=getprev style='display:none;text-align:center;background-color:#005192;color:white;cursor:pointer;padding:2px 0px;margin:4px 4px 0px 4px'>previous</div>")
        const _len = data.list.length
        for (let i = 0; i < _len; i++) {
            const row = data.list[i]
            const msgid = row.MSGID
            const cdt = row.CDT
            const cdt1 = cdt.substr(0, 16)
            const type = row.TYPE
            let body
            if (type == "image") {
                body = type
            } else if (type == "file" || type == "flink") {
                const _fileStr = row.BODY.split(hush.cons.deli)
                const _filepath = _fileStr[0].split("/")
                const _filenameLong = _filepath[_filepath.length - 1]
                const _brr = _filenameLong.split(hush.cons.subdeli) //original_filename_body + hush.cons.subdeli + 20191016081710239944.mp4
                const _crr = _brr[1].split(".")
                body = (_crr.length > 1) ? _brr[0] + "." + _crr[1] : _brr[0] //original_filename_body.mp4                    
            } else  {
                body = row.BODY
            }
            const _top = (i == 0) ? "Y" : ""
            let _html = "<div id=res_" + msgid + " class=result data-top='" + _top + "' data-cdt='" + cdt + "' style='cursor:pointer'>"
            _html += "      <div style='height:18px;font-size:8px;display:flex;align-items:center;margin-left:3px'>" + cdt1 + "</div>"
            _html += "      <div class=coDotDot style='height:20px;color:#005192;margin-left:3px'>" + body + "</div>"
            _html += "  </div>"
            list.append(_html)
        }                
        $("#result_cnt").html(_len) 
        list.scrollTop(list.prop("scrollHeight")) 
        $(".result").off("click").on("click", function(e) { 
            procHighlight($(this))
            const start = $(this).data("cdt")
            if (start >= g_cdt) {
                const _id = this.id.substring(4)
                const _cellTop = $("#msg_" + _id).position().top
                if (_cellTop >= 0 && _cellTop <= g_list_msg.height() - 40) {
                    //cell positioned within g_list_msg box
                } else {
                    const _scrollTop = g_list_msg.scrollTop()
                    g_list_msg.scrollTop(_scrollTop + $("#msg_" + _id).position().top)
                }
                procHighlight($("#high_" + _id))
                return
            }
            const end = g_cdt
            getMsgList("result", null, start, end)
            if ($(this).data("top") == "Y") {
                $("#getprev").data("cdt", $(this).data("cdt"))
                setTimeout(() => $("#getprev").show(), 1000)
            }
        })
        $("#res_" + data.list[_len - 1].MSGID).click()
        $("#getprev").off("click").on("click", function(e) { 
            g_cdt = $(this).data("cdt")
            getMsgList()
            setTimeout(() => $("#getprev").hide(), 500)
        })
    } catch (ex) {
        hush.msg.alert("setResult: " + ex.message)
    }
}

const imgPromise = (_img) => new Promise((resolve, reject) => {
    //display is none before image or openGraph loaded
    //reslove() not applied to image load event because function for image/fileImage/openGraph load is too scattered (the reason why using css display property check)
    let max_cnt = 0
    function chkImgLoad(_img) {
        if (_img.css("display") != "none") {
            resolve()
        } else {
            if (max_cnt <= 10) { //5 seconds timeout for checking image load
                max_cnt += 1
                setTimeout(function() { chkImgLoad(_img) }, 500)
            } else {
                resolve() //resolve even if it's timeout since promise.all used (eg: no opengraph for invalid http(s) url -> have to resolve(skip))
            }
        }
    }
    chkImgLoad(_img)
})

const procQueryUnread = () => {
    try {
        const len = $(".needCheckUnread").length
        if (len == 0) return
        if (len > hush.cons.unread_max_check) {
            $("#btn_qry_etc").hide()
            $("#txt_unread_notice").show()
            return
        }
        $("#txt_unread_notice").hide()  
        $("#btn_qry_etc").show() 
        const arr = []
        const list_height = g_list_msg.height()
        for (let i = len - 1; i >= 0; i--) {
            const obj = $(".needCheckUnread").eq(i)
            const top = obj.position().top
            if (top > list_height) {
                //continue
            } else if (top >= -100 && top <= list_height) {
                arr.push(obj.attr("id").substring(4)) //msg_ removed 
            } else {
                break
            }
        }
        if (arr.length == 0) return
        const rq = { type : "query", msgidArr : arr }                
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_read_msg, JSON.stringify(rq), g_roomid, null, false) //procMsg=false
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_read_msg, rq, g_roomid)
        }
    } catch (ex) {
        hush.msg.alert("procQueryUnread: " + ex.message)
    }
}

const addRow = (obj, kind) => {
    if (!kind) resetEnvForScroll()
    let _dt = (obj.cnt == -1) ? obj.cdt : hush.util.tzDateTime(obj.cdt) //cnt=-1 means local data
    _dt = hush.util.formatMsgDt(_dt, g_year)
    if (obj.type == "invite" || obj.type == "leave") {
        let _desc                
        if (obj.type == "invite") {
            const _arr = obj.body.split(hush.cons.deli)
            _desc = _arr[0] + "<br><span style='font-size:12px'>invited by " + _arr[2] + "<br>at " + _dt + "</span>"
        } else {
            _desc = obj.body + "<br><span style='font-size:12px'>at " + _dt + "</span>"
        }
        const _html = "<div id=msg_" + obj.msgid + " style='text-align:center;background:lightgray;font-size:12px;border:1px solid lightgray;border-radius:5px;padding:3px 10px;margin:10px auto'>" + _desc + "</div>"
        if (kind) {
            if (kind == "after") {
                g_list_msg.append(_html)
            } else {
                g_list_msg.prepend(_html)
            }                    
        } else {                    
            g_list_msg.append(_html)
        }
    } else {
        let cnt, needCheckUnread, handlingDisp, unreadDisp
        if (obj.cnt == 0) {
            cnt = ""
            needCheckUnread = "" //css class
            handlingDisp = " style='display:none'"
            unreadDisp = " style='display:none'"
        } else {
            cnt = !hush.util.isvoid(obj.cnt) ? obj.cnt : $(".mem").length //cnt = "+" + hush.cons.max_unread_cnt
            needCheckUnread = " needCheckUnread" //css class
            handlingDisp = ""
            unreadDisp = ""
        }
        let _body, _backcolor, _boderpx, _sublink //_sublink can be 1) opengraph for url 2) image for .png/jpg/.. 3) image for mp4
        const _submargin = (obj.senderid == g_userid) ? "margin:4px 4px 1px 1px" : "margin:4px 1px 1px 4px"
        const _replied = obj.reply || ""
        const _dispReplied = obj.reply ? "" : "display:none;"
        if (obj.type == "image") {
            if (obj.body == hush.cons.cell_revoked) {
                _body = obj.body
                obj.bufferStr = null //obj.buffer = null
            } else {
                _body = "<img id=img_" + obj.msgid + " style='display:none;max-width:150px;max-height:150px;cursor:pointer;margin-top:4px'>"
            }
            _boderpx = "0px"
        } else if (obj.type == "file" || obj.type == "flink") {
            if (obj.body == hush.cons.cell_revoked) {
                _body = obj.body
            } else { 
                const _fileStr = obj.body.split(hush.cons.deli)                
                const _filelink = procFileLinkIfExists(obj, kind)
                const _filesize = hush.util.formatBytes(parseInt(_fileStr[1]))
                const _expiry = hush.util.getExpiryWithTZ(obj.filestate, g_year)
                const _color = obj.filestate == hush.cons.file_expired ? "darkgray" : "#005192"
                _body = "<span id=filelink_" + obj.msgid + " style='color:" + _color + ";cursor:default'>" + _filelink + "</span><br>"
                _body += "<span style='color:darkgray;cursor:default;font-size:12px;margin-left:4px'>" + ((obj.type == "flink") ? "Filelink" : "File") + "</span> "
                _body += "<span style='color:#005192;cursor:default;font-size:12px'>" + _filesize + "</span> "
                _body += "<span id=expiry_" + obj.msgid + " style='color:darkgreen;cursor:default;font-size:12px'>" + _expiry + "</span>"
                _body += "<span id=abort_" + obj.msgid + " style='display:none;color:darkgray;cursor:pointer;font-size:12px;margin-left:4px'>Abort</span>"
                _body += "<progress id=pb_" + obj.msgid + " value=0 max=100 style='display:none;width:100%;height:6px;cursor:default;margin-bottom:3px'></progress>"
                _boderpx = "1px"
                if (obj.filestate != hush.cons.file_expired) {
                    const _submax = (obj.senderid == g_userid) ? "" : ";max-width:150px;max-height:150px"
                    _sublink = "<div style='position:relative;cursor:pointer" + _submax + "'>"
                    _sublink += "   <img id=img_" + obj.msgid + " style='display:none;max-width:150px;max-height:150px;" + _submargin + "'/>"
                    _sublink += "   <img id=play_" + obj.msgid + " src='/img/play.png' style='z-index:1;display:none;position:absolute;width:32px;height:32px;left:0;right:0;top:0;bottom:0;margin:auto' />"
                    _sublink += "</div>"
                }
            }
        } else {
            if (obj.body == hush.cons.cell_revoked) {
                _body = obj.body
            } else { 
                _body = hush.util.removeTag(obj.body)
            }
            _boderpx = "1px"
            const _pattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi //two more bytes parameter not working
            const _http = _pattern.exec(_body) //const _pattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9가-힣+&@#\/%?=~_|!:,.;]*[-A-Z0-9가-힣+&@#\/%=~_|])/gi
            if (_http != null) { //##00 opengraph : get first item
                _body = _body.replace(_pattern, "<a href='javascript:openLink(\"$1\")' style='color:#005192'>$1</a>")				
                _sublink = "<div style='clear:both'></div>"
                _sublink = "<div id=openGraph" + obj.msgid + " og=" + _http[0] + " style='display:none;cursor:pointer;width:150px;height:150px;border:1px solid lightgray;" + _submargin + "'>"
                _sublink += "   <div style='width:100%;text-align:center'><img id=ogImg" + obj.msgid + " style='max-width:150px;max-height:150px' /></div>"
                _sublink += "   <div id=ogTitle" + obj.msgid + " style='width:100%;height:20px;font-size:14px;color:darkgreen;font-weight:bold;text-align:left;vertical-align:middle;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-left:3px'></div>"
                _sublink += "   <div id=ogDesc" + obj.msgid + " style='width:100%;height:20px;font-size:13px;text-align:left;vertical-align:middle;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-left:3px'></div>"
                _sublink += "</div>"
            }
        }
        let _html
        if (obj.senderid == g_userid) { //sent
            _backcolor = (obj.type == "image") ? "white" : "lightyellow"
            _html = "<div id=msg_" + obj.msgid + " class='talk" + needCheckUnread + "' style='display:flex;flex-direction:column;align-items:flex-end;margin:10px 0px 0px 0px'>"
            _html += "  <div style='display:flex;align-items:center;justify-content:flex-end;margin-bottom:4px'>"
            _html += "      <span id=handling_" + obj.msgid + " class=unread" + handlingDisp + ">" + hush.cons.handling + "</span>"    
            _html += "      <span id=unread_" + obj.msgid + " class=unread" + unreadDisp + ">" + cnt + "</span>"
            _html += "      <span id=dt_" + obj.msgid + " style='font-size:11px;color:darkgray;cursor:default;margin-left:6px'>" + _dt + "</span>"
            _html += "      <img id=menu_" + obj.msgid + " src='" + hush.cons.logo_darkblue + "' style='width:20px;height:20px;cursor:pointer;margin:0px 4px 0px 6px'>"                
            _html += "  </div>"
            _html += "  <div style='width:100%;display:flex;align-items:center;justify-content:space-between'>"
            _html += "      <div style='width:10%'>"
            _html += "          <input type=checkbox id=sel_" + obj.msgid + " class=chkboxSel style='display:none;margin-left:10px' />"
            _html += "      </div>"
            _html += "      <div id=high_" + obj.msgid + " style='max-width:80%;background-color:" + _backcolor + ";border:" + _boderpx + " solid lightgray;border-radius:3px;padding:3px;margin-right:4px'>"
            _html += "	        <div id=replied_" + obj.msgid + " style='" + _dispReplied + "color:darkgray;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:12px;cursor:default'>" + _replied + "</div>"
            _html += "	        <div id=body_" + obj.msgid + " style='text-align:left;white-space:pre-wrap;word-break:break-all;font-size:15px'>" + _body + "</div>"
            _html += "      </div>"
            _html += "  </div>"
            if (_sublink) _html += _sublink
            _html += "  <div style='display:flex;align-items:center;justify-content:flex-end;height:20px;padding-top:4px;margin-bottom:4px'>"
            _html += "      <span id=save_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-right:6px'>[save]</span>" 
            _html += "      <span id=reply_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-right:6px'>[reply]</span>"   
            _html += "      <span id=cellmenu_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-right:6px'>[menu]</span>"   
            _html += "  </div>"
            _html += "</div>"
        } else { //received
            _backcolor = (obj.type == "image") ? "white" : "mintcream"
            _html = "<div id=msg_" + obj.msgid + " class='talk" + needCheckUnread + "' style='display:flex;flex-direction:column'>"
            _html += "  <div style='display:flex;align-items:center;margin-bottom:4px'>"
            _html += "      <img id=menu_" + obj.msgid + " src='" + hush.cons.logo_darkblue + "' style='width:20px;height:20px;cursor:pointer;margin:0px 6px 0px 4px'>"
            _html += "      <span style='font-size:12px;color:#063470;cursor:default;margin-right:6px'>" + obj.sendernm + "</span>"
            _html += "      <span style='font-size:11px;color:darkgray;cursor:default;margin-right:4px'>" + _dt + "</span>"
            _html += "      <span id=unread_" + obj.msgid + " class=unread" + unreadDisp + ">" + cnt + "</span>"
            _html += "      <span id=handling_" + obj.msgid + " class=unread" + handlingDisp + ">" + hush.cons.handling + "</span>"    
            _html += "  </div>"
            _html += "  <div style='width:100%;display:flex;align-items:center;justify-content:space-between'>"
            _html += "      <div id=high_" + obj.msgid + " style='max-width:80%;background-color:" + _backcolor + ";border:" + _boderpx + " solid lightgray;border-radius:3px;padding:3px;margin-left:4px'>"
            _html += "	        <div id=replied_" + obj.msgid + " style='" + _dispReplied + "color:darkgray;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-size:12px;cursor:default'>" + _replied + "</div>"
            _html += "	        <div id=body_" + obj.msgid + " type='" + obj.type + "' style='white-space:pre-wrap;word-break:break-all;font-size:15px'>" + _body + "</div>"
            _html += "      </div>"
            _html += "      <div style='width:10%;text-align:right'>"
            _html += "          <input type=checkbox id=sel_" + obj.msgid + " class=chkboxSel style='display:none;margin-right:10px' />"
            _html += "      </div>"
            _html += "  </div>"
            if (_sublink) _html += _sublink
            _html += "  <div style='display:flex;align-items:center;height:20px;padding-top:4px;margin-bottom:4px'>"
            _html += "      <span id=cellmenu_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-left:6px'>[menu]</span>"   
            _html += "      <span id=reply_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-left:6px'>[reply]</span>"   
            _html += "      <span id=save_" + obj.msgid + " style='display:none;color:#FD760B;font-size:14px;cursor:pointer;margin-left:6px'>[save]</span>"
            _html += "  </div>"
            _html += "</div>"
        }
        if (kind) {
            if (kind == "after" || obj.cnt == -1) { //-1 means from local IndexedDB
                g_list_msg.append(_html)
            } else {
                g_list_msg.prepend(_html)
            }
            if ($("#img_" + obj.msgid).length > 0) {
                g_imgPromiseArr.push(imgPromise($("#img_" + obj.msgid)))
            } else if ($("#openGraph" + obj.msgid).length > 0) {
                g_imgPromiseArr.push(imgPromise($("#openGraph" + obj.msgid)))
            }
        } else {
            g_list_msg.append(_html)
        }
        if (obj.bufferStr != null) { //only for image
            hush.http.ajaxCall(hush.cons.route + "/get_msginfo", { msgid : obj.msgid, body : obj.body }, "get", function(rsPic) {
                if (rsPic.buffer) {
                    const blobUrl = hush.http.getBlobUrlForImage(rsPic.buffer.data)
                    imageSrcEvent(blobUrl, obj.msgid, kind, obj.type, obj.body) //$("#~").attr("src", "data:image/png;base64," + data)
                }
            }, false)
        }
        if (obj.type == "talk") {
            if (_sublink) {
                procOpengraph(obj.msgid, kind)
            } else if (obj.body.length == 2) { //to make display one emoji big
                const korean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/; //needs nice solution : temporary way to avoid conflict korean and emoji like 'ㅋㅋ'
                if (!korean.test(obj.body) && hush.util.chkEmoji(obj.body)) $("#body_" + obj.msgid).css("font-size", "48px")
            }
        }
        $("#unread_" + obj.msgid).off("click").on("click", function() {
            const rq = { type : "getmembers", msgid : obj.msgid }
            if (hush.webview.ios) { 
            } else if (hush.webview.and) {
                AndroidCom.send(hush.cons.sock_ev_read_msg, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
            } else {
                hush.sock.send(g_socket, hush.cons.sock_ev_read_msg, rq, g_roomid)
            }
        })
        $("#msg_" + obj.msgid).off("mouseenter").on("mouseenter", function(e) {						
            $("#cellmenu_" + obj.msgid).show()
            if (obj.filestate == hush.cons.file_expired || $("#body_" + obj.msgid).html() == hush.cons.cell_revoked) return
            $("#reply_" + obj.msgid).show()
            if (obj.type != "file" && obj.type != "flink" && obj.type != "image") return
            $("#save_" + obj.msgid).show()
        })
        $("#msg_" + obj.msgid).off("mouseleave").on("mouseleave", function(e) {
            $("#reply_" + obj.msgid).hide()
            $("#cellmenu_" + obj.msgid).hide()
            $("#save_" + obj.msgid).hide()
        })
        $("#reply_" + obj.msgid).off("click").on("click", function() {
            if (obj.filestate == hush.cons.file_expired || $("#body_" + obj.msgid).html() == hush.cons.cell_revoked) return
            let _msg = obj.sendernm + " - " + hush.util.displayTalkBodyCustom(obj.type, obj.body)
            let _html = "<span id=cancelreply style='line-height:20px;color:#FD760B;cursor:pointer'>[cancel]</span> "
            _html += "<span id=msgtoreply style='line-height:20px;color:#005192;cursor:default'>re) " + _msg + "</span> "
            $("#fr_tip").html(_html)
            $("#cancelreply").off("click").on("click", function() {
                setTitleToFrTip(true)
            })
        })
        $("#save_" + obj.msgid).off("click").on("click", function() {
            if (obj.filestate == hush.cons.file_expired || $("#body_" + obj.msgid).html() == hush.cons.cell_revoked) return
            if (obj.type == "image") {
                hush.http.fileDownload("imagetofile", obj.msgid)
            } else {
                hush.http.fileDownload($("#ahref_" + obj.msgid).attr("param1"), $("#ahref_" + obj.msgid).attr("param2"))
            }
        })
    }
}

const procForCell = (obj) => {
    if (obj.type == "invite" || obj.type == "leave") return
    $(".chkboxSel").off("click").on("click", function(e) { 
        const len = $(".chkboxSel:checked").length
        $("#cnt_sel").html(len)
        if (len == 0) {
            showCellMenu(false)
        } else if (len == 1) {
            if ($("#btn_delete_cell").css("display") == "none") $(".single").show()                    
        } else {
            $(".single").hide()
        }
    })
    $("#btn_delete_cell, #btn_delete_cell_m").off("click").on("click", function(e) { 
        const checked = $(".chkboxSel:checked")
        const len = checked.length
        if (len == 0) {
            hush.msg.toast(hush.cons.msg.no_data)
            return
        }
        hush.msg.alert("Continue to delete ? (" + len + ")", {
            "Yes": function() { 
                const msgidArr = []
                for (let i  = 0; i < len; i++) msgidArr.push(checked[i].id.substring(4)) //sel_2019~
                const rq = { msgidArr : msgidArr, type : "", receiverid : g_userid, roomid : g_roomid }
                if (hush.webview.ios) {
                } else if (hush.webview.and) {
                    AndroidCom.send(hush.cons.sock_ev_delete_msg, JSON.stringify(rq), g_roomid, "parent", true) //procMsg=true
                } else {
                    hush.sock.send(g_socket, hush.cons.sock_ev_delete_msg, rq, g_roomid, "parent")
                }
                hush.msg.close()
                showCellMenu(false)
            }, "No": function() { 
                hush.msg.close() 
                showCellMenu(false)
            } 
        })                
    })
    $("#btn_cancel_cell, #btn_cancel_cell_m").off("click").on("click", function(e) { showCellMenu(false) })
    if (!hush.webview.on) $("#msg_" + obj.msgid).on("contextmenu", function(e) { $("#menu_" + obj.msgid).click() })
    $("#msg_" + obj.msgid).off("click").on("dragstart", function(e) { 
        if (obj.type == "" || !hush.cons.chat_handled.includes(obj.type)) return
        e.originalEvent.dataTransfer.setData("text", obj.type + hush.cons.deli + g_roomid + hush.cons.deli + obj.msgid)
        e.originalEvent.dataTransfer.effectAllowed = "copy"
    })
    $("#menu_" + obj.msgid + ", #cellmenu_" + obj.msgid).off("click").on("click", function(e) { 
        if ($("#btn_delete_cell").css("display") == "none") {
            showCellMenu(true, obj)
            $("#btn_copy_cell, #btn_copy_cell_m").off("click").on("click", function(e) { 
                if (obj.type == "" || !hush.cons.chat_handled.includes(obj.type)) return 
                if ($("#body_" + obj.msgid).html() == hush.cons.cell_revoked) {
                    hush.msg.toast(hush.cons.cell_revoked)
                    return
                }
                if (obj.filestate == hush.cons.file_expired) {
                    hush.msg.toast(hush.cons.file_expired)
                    return
                }
                const _id = this.id
                if (_id == "btn_copy_cell") {
                    const t = document.createElement("input")
                    document.body.appendChild(t)
                    t.value = "btn_copy_cell" + hush.cons.deli + obj.type + hush.cons.deli + g_roomid + hush.cons.deli + obj.msgid
                    t.select()
                    document.execCommand('copy')
                    document.body.removeChild(t)
                    showCellMenu(false)
                    hush.msg.toast("Now " + obj.type + " will be sent with Ctrl+V.") //image, file, flink will be ok too
                } else { //mobile
                    AndroidRoom.copy(obj.msgid)
                    hush.msg.toast("Now " + obj.type + " will be sent with SendCopy button.") //image, file, flink will be ok too
                    $("#fr_tip").hide()
                    $("#fr_sendcopy").show()
                }
                showCellMenu(false)
            })
            $("#btn_revoke_cell, #btn_revoke_cell_m").off("click").on("click", function(e) {                    
                if (obj.type == "" || !hush.cons.chat_handled.includes(obj.type)) return 
                if ($("#body_" + obj.msgid).html() == hush.cons.cell_revoked) {
                    hush.msg.toast(hush.cons.cell_revoked)
                    return
                }
                if (obj.filestate == hush.cons.file_expired) {
                    hush.msg.toast(hush.cons.file_expired)
                    return
                }
                if (obj.senderid != g_userid) {
                    hush.msg.toast("Incoming message won't be handled.")
                    return
                }
                hush.msg.alert("Do you want revoke(cancel) message already sent to all members in this chat room?", { 
                    "Yes": function() { 
                        const rq = { msgid : obj.msgid, type : obj.type, senderid : g_userid, roomid : g_roomid }
                        if (hush.webview.ios) {
                        } else if (hush.webview.and) {
                            AndroidCom.send(hush.cons.sock_ev_revoke_msgcell, JSON.stringify(rq), g_roomid, "parent", true) //procMsg=true
                        } else {
                            hush.sock.send(g_socket, hush.cons.sock_ev_revoke_msgcell, rq, g_roomid, "parent")
                        }                                
                        hush.msg.close()
                        showCellMenu(false)
                    }, "No": function() { 
                        hush.msg.close()
                        showCellMenu(false) 
                    } 
                }, "Cancel Send", 200)
            })
        } else {
            showCellMenu(false)
        }
    })
}

const getMsgList = async (type, keyword, start, end) => {
    try {
        g_year = (new Date()).getFullYear().toString()
        let rq, withToast = true, includeInviteOrLeave = false
        if (type == "search") {
            rq = { type : type, roomid : g_roomid, keyword : keyword, cnt : hush.cons.fetch_cnt_oneshot }
        } else if (type == "etc") {
            rq = { type : type, roomid : g_roomid, cnt : hush.cons.fetch_cnt_oneshot }
        } else if (type == "result") {
            rq = { type : type, roomid : g_roomid, dt : g_cdt, start : start, end : end }
        } else if (type == "onlyone") {
            rq = { type : type, roomid : g_roomid, senderid : keyword, dt : g_cdt, cnt : hush.cons.fetch_cnt_oneshot }
        } else if (type == "after") {
            rq = { type : type, roomid : g_roomid, keyword : keyword } //keyword=msgid (after msgid)
            withToast = false
        } else {                    
            const cnt = (g_cdt == FIRST_QUERIED) ? hush.cons.fetch_first_cnt : hush.cons.fetch_cnt
            rq = { type : "normal", roomid : g_roomid, dt : g_cdt, cnt : cnt }
            withToast = false
        }
        const rs = await hush.http.ajax(hush.cons.route + "/qry_msglist", rq, null, withToast)
        if (rs.code != hush.cons.result_ok && rs.code != hush.cons.result_no_data) {
            hush.msg.alert("getMsgList:" + rs.msg)
            return
        }
        const _len = rs.list.length
        if (rq.type == "search" || rq.type == "etc") {
            if (_len == 0) {
                hush.msg.toast(hush.cons.msg.no_data)
                $("#result_cnt").html(_len) 
                return
            }
            setResult(rs)
        } else {
            if (_len == 0) {
                if (rq.type == "after") {
                    procQueryUnread()
                    return
                } 
                if ($("#getmore").length > 0) $("#getmore").remove()
                if (g_cdt == FIRST_QUERIED) {
                    hush.msg.toast(hush.cons.msg.no_data)
                } else {
                    hush.msg.toast(hush.cons.msg.no_more_data)
                }
                return
            } else if (rq.type == "after" && _len > hush.cons.max_add_count) { //in case of large add, you'd better refresh(open_room)
                resetEnvForScroll()
                g_list_msg.empty()
                openRoomWithMobile() //for updating data
                return
            }
            g_imgPromiseArr = []
            g_stopAutoScrollDown = null
            if (rq.type == "normal") {
                if (rq.dt != FIRST_QUERIED) { //$(".more").remove() //const _html = drawLine("more", "more above")
                    const _html = drawLine("more", "page " + (g_page + 1) + " (below)")
                    g_page += 1
                    g_list_msg.prepend(_html)  
                } else {
                    g_page = 0
                }
            }
            let _first_msgid = "", _prev_read = "R"
            for (let i = 0; i < _len; i++) {
                const obj = { } //should be the same as obj when send_msg. send_msg때의 obj로 만들어야 렌더링때 문제없음
                const row = rs.list[i]
                obj.msgid = row.MSGID
                obj.cdt = row.CDT
                g_cdt = obj.cdt //should be set before scrollToTarget()
                obj.senderid = row.SENDERID
                obj.sendernm = row.SENDERNM
                obj.body = row.BODY
                obj.buffer = row.BUFFER
                obj.bufferStr = row.BUFFERSTR
                obj.reply = row.REPLY
                obj.type = row.TYPE
                obj.state = row.STATE
                obj.filestate = row.FILESTATE
                obj.cnt = row.CNT
                if (rq.type == "after") {
                    if (obj.body == hush.cons.cell_revoked) {
                        updateAsRevoked(obj.msgid)
                    } else {
                        addRow(obj, rq.type)
                        if (obj.type == "invite" || obj.type == "leave") includeInviteOrLeave = true
                    }
                } else {
                    addRow(obj, rq.type) //addRow(obj, "fromList") => if data.type defined, it is called from getMsgList
                    if (_prev_read == "" && obj.state == "R") {
                        const _html = drawLine("markUnread", "Belows are unreads")
                        $(_html).insertAfter("#msg_" + obj.msgid)
                    }
                }
                procForCell(obj)
                if (rq.type == "normal") {
                    if (g_page == 0 && _len < hush.cons.fetch_first_cnt) {
                        //#getmore not needed since no data from previous page
                        //이전페이지에서 가져올 데이터가 없으므로 #getmore가 필요없음
                    } else {
                        if (i == _len - 1 && _first_msgid != "") {
                            if ($("#getmore").length > 0) $("#getmore").remove()
                            const _first = $("#msg_" + _first_msgid) //not appended but prepended
                            if (_first && _first.length > 0) {  //console.log(_first.position().top + _first.height() + 1, "=====", g_list_msg.height())
                                //If hush.cons.fetch_cnt is too small, this 'if' maybe won't be checked (consider image downloadwith async).
                                //hush.cons.fetch_cnt가 너무 작은 값이면 아래 'if'에 안걸릴 수도 있음 (이미지다운로드가 비동기인 것도 감안)
                                if (_first.position().top + _first.height() + 100 > g_list_msg.height()) { //g_list_msg position should be relative for checking position().top
                                    const _html = "<div id=getmore style='display:flex;align-items:center;justify-content:center;background:steelblue;color:white'>getting data..</div>"
                                    g_list_msg.prepend(_html)
                                }
                            }
                        } else if (i == 0) {
                            _first_msgid = obj.msgid
                        }
                    }
                }
                _prev_read = obj.state
            }
            if (rq.type == "result") {
                const msgid = rs.list[rs.list.length - 1].MSGID
                procHighlight($("#high_" + msgid))
                scrollToTarget(0)
            } else if (rq.dt == FIRST_QUERIED || $("#getmore").length == 0) {
                scrollToTarget()
                updateAllUnreads("Y")
                procQueryUnread()
            } else if (rq.type == "after") {
                scrollToTarget()
            } else {
                scrollToTarget(".more")
            }                    
            if (g_imgPromiseArr.length > 0) {
                Promise.all(g_imgPromiseArr).then(function() { 
                    g_stopAutoScrollDown = false
                })
            } else {
                g_stopAutoScrollDown = false
            }
            if (includeInviteOrLeave) { //mobile only : in order to refresh members => setMembers()
                const rq = { from : "after", userid : g_userid }
                if (hush.webview.ios) { 
                } else if (hush.webview.and) {
                    AndroidCom.send(hush.cons.sock_ev_open_room, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
                }
            }
            if (!hush.webview.on) g_in_chat.focus()
            if (rq.type == "normal" && g_page == 0) {
                const _arr = []
                let _brr
                const tx = hush.idb.db.transaction(hush.cons.tbl, "readonly") //readonly
                const os = tx.objectStore(hush.cons.tbl) //if (!os) os = ~ error occurs
                const index = os.index("roomid") //let req = os.openCursor() //req = os.count(); req.onsuccess = function(evt) { console.log("====" + evt.target.result) }
                let req = index.openCursor(IDBKeyRange.only(g_roomid))
                req.onsuccess = async function(evt) {
                    const cursor = evt.target.result
                    if (cursor) { //console.log("cursor:", cursor) //cursor.key = cursor.value.roomid in this case
                        _arr.push(cursor.value.msgid)
                        cursor.continue()                               
                    } else { //console.log("No more entries")
                        if (_arr.length == 0) return
                        const rs = await hush.http.ajax(hush.cons.route + "/get_msginfo", { msgids : _arr, kind : "check" })
                        if (rs.code != hush.cons.result_ok) return
                        const _len = rs.list.length //sending failure
                        if (_len == 0) return
                        _brr = rs.list
                        const tx1 = hush.idb.db.transaction(hush.cons.tbl, "readonly")
                        const os = tx1.objectStore(hush.cons.tbl) //if (!os) os = ~ error occurs
                        for (let i = 0; i < _len; i++) {
                            const _msgid = _brr[i] //If _msgid is undefined, 'The transaction has finished' error occurs for 'os.get(_msgid).onsuccess' below.
                            os.get(_msgid).onsuccess = function(e) {
                                const rec = e.target.result
                                if (rec) {
                                    const obj = {}
                                    obj.msgid = rec.msgid
                                    obj.cdt = rec.cdt
                                    obj.senderid = g_userid
                                    obj.sendernm = g_usernm
                                    obj.body = rec.body
                                    obj.buffer = null
                                    obj.bufferStr = null
                                    obj.reply = ""
                                    obj.type = "talk"
                                    obj.state = ""
                                    obj.filestate = ""
                                    obj.cnt = -1 //-1 means from local IndexedDB
                                    addRow(obj, rq.type) //normal
                                    retrySending(obj)
                                }
                            }
                        }
                        tx1.oncomplete = function() {
                            scrollToTarget()
                            if (_arr.length > 0) {
                                const _crr = _arr.filter(x => !_brr.includes(x)) //_arr - _brr = _crr
                                for (msgid of _crr) deleteLocalMsg(msgid)
                            }
                        }
                    }
                }            
            }
        }
    } catch (ex) {
        hush.msg.alert("getMsgList: " + ex.message)
    }
}

const procFailure = (rq, dtDetails) => { //Request already sent. Retry(resending) might not be needed in most cases since error already occurred.
    if ($("#unread_" + rq.msgid).html() == hush.cons.no_response) return 
    $("#msg_" + rq.msgid).removeClass("needCheckUnread")
    $("#handling_" + rq.msgid).hide()
    const objUnread = $("#unread_" + rq.msgid)
    objUnread.html(hush.cons.sending_failure)
    objUnread.removeClass("unread").addClass("failure")
    objUnread.show()
    objUnread.off("click").on("click", function() { 
        hush.msg.alert(dtDetails, { //hush.msg.alert(dtDetails) 
            "Remove Talk": function() { 
                $("#msg_" + rq.msgid).remove()
                hush.msg.close()
            }, "Close": function() { 
                hush.msg.close()
            } 
        }, "Sending Failure", 320)
    })
}

const deleteLocalMsg = (msgid) => {
    const tx = hush.idb.db.transaction(hush.cons.tbl, "readwrite")
    const os = tx.objectStore(hush.cons.tbl) //if (!os) os = ~ error occurs
    os.get(msgid).onsuccess = function(e) {
        if (e.target.result) os.delete(msgid)
    }
}

const retrySending = (rq) => {
    $("#handling_" + rq.msgid).hide()
    $("#msg_" + rq.msgid).removeClass("needCheckUnread")
    const objUnread = $("#unread_" + rq.msgid)
    objUnread.html(hush.cons.retry_sending)
    objUnread.removeClass("unread").addClass("failure")
    objUnread.show()
    objUnread.off("click").on("click", function() {
        hush.msg.alert("Do you want to retry sending ?", {
            "Retry": function() { 
                $("#msg_" + rq.msgid).remove()
                const rq1 = initMsg()
                rq1.type = "talk"
                rq1.body = rq.body
                procSendAndAppend(rq1)
                deleteLocalMsg(rq.msgid)
                hush.msg.close()
            }, "Delete": function() { 
                $("#msg_" + rq.msgid).remove()
                deleteLocalMsg(rq.msgid)
                hush.msg.close()
            }, "Close": function() { 
                hush.msg.close() 
            } 
        }, hush.cons.retry_sending)
    })
}

const prepareForNoResponse = (rq) => {
    setTimeout(() => {
        if ($("#handling_" + rq.msgid).css("display") == "none") return        
        $("#handling_" + rq.msgid).hide()
        $("#msg_" + rq.msgid).removeClass("needCheckUnread")
        const objUnread = $("#unread_" + rq.msgid)
        objUnread.html(hush.cons.no_response)
        objUnread.removeClass("unread").addClass("failure")
        objUnread.show()
        objUnread.off("click").on("click", function() {
            hush.msg.alert("Do you want to check if talk sent ?", {
                "Yes": function() {
                    $("#handling_" + rq.msgid).show()
                    objUnread.hide() 
                    const rqCheck = initMsg()
                    rqCheck.type = "check"
                    rqCheck.prevmsgid = rq.msgid
                    if (hush.webview.ios) {
                    } else if (hush.webview.and) {
                        AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rqCheck), g_roomid, null, true) //procMsg=true
                    } else {
                        hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rqCheck, g_roomid)
                    }
                    prepareForNoResponse(rq)
                    hush.msg.close()
                }, "No": function() { 
                    hush.msg.close() 
                } 
            }, hush.cons.no_response)
        })
    }, hush.cons.send_timeout_sec * 1000)
}

const procSendAndAppend = (rq, blobUrl) => {
    const _focused = hush.webview.screenHeightOnLoad == $(window).height() ? false : true //g_in_chat.is(":focus") ? true : false
    addRow(rq)
    if (rq.type == "image") { //sent by ajax and should be noticed to all members
        showImgMenu(false)
        imageSrcEvent(blobUrl, rq.msgid) //Image needs to be shown when starting sending for sender
    } else if (rq.type == "file") { //skip
    } else {
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rq), g_roomid, "parent", false) //procMsg=false
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rq, g_roomid, "parent")
        }
    }
    scrollToTarget()
    g_in_chat.val("")
    $("#fr_byte").html("")
    if (_focused) g_in_chat.focus()       
    if (rq.type != "file") prepareForNoResponse(rq)
    if (rq.type == "talk") {
        const tx = hush.idb.db.transaction(hush.cons.tbl, "readwrite")
        const os = tx.objectStore(hush.cons.tbl) //if (!os) os = ~ error occurs
        const os_req = os.get(rq.msgid)
        os_req.onsuccess = function(e) {
            if (os_req.result) return //const rec = os_req.result
            const add_req = os.add({ roomid : g_roomid, msgid : rq.msgid, body : rq.body, cdt : hush.util.getCurDateTimeStr(true) })
            add_req.onsuccess = function() { /*do nothing*/ }
            add_req.onerror = function(e) { /*console.log("add_req error: " + e.srcElement.error)*/ }
            tx.oncomplete = function() { /*console.log("all done")*/ }  
        }
        os_req.onerror = function(e) { /*console.log("os_req error: " + e.srcElement.error)*/ }   
    }
}

const initMsg = () => { //differ from index.html
    const memberidArr = [ ], membernmArr = [ ]
    const mem = $(".mem")
    if (mem.length > 0) {
        for (let item of mem) {
            memberidArr.push(item.id.substring(4))
            membernmArr.push($(item).data("usernm"))
        }
    }
    const _msgid = hush.util.createId(g_token10)
    const _curdt = hush.util.getCurDateTimeStr(true) //local backup in a sense
    return { msgid : _msgid, senderkey : g_userkey, senderid : g_userid, sendernm : g_usernm, cdt : _curdt,
                filestate : "", body : "", buffer : null, reply : "", type : "", receiverid : memberidArr, receivernm : membernmArr,
                prevmsgid : "", roomid : g_roomid, roomnm : "", 
                bufferStr : null, state : "", unread : mem.length, line : "" } //These 4 properties are needed for mobile. 4개는 web과는 다르게 모바일에서 필요.
}

const getMsgToReply = () => {
    const _msg = ($("#msgtoreply").length > 0) ? $("#msgtoreply").html().trim() : ""
    if (_msg) setTitleToFrTip(true)
    return _msg
}

const sendMsg = (type, blobUrlOrBody, blobOrFilestate) => {
    try {
        const rq = initMsg()
        if (type == "image") { //ajax used. arraybuffer sent with blank on socket.io-redis npm. download (through socket) is ok                    
            rq.type = type
            procSendAndAppend(rq, blobUrlOrBody)
            const fd = new FormData()
            fd.append("msgid", rq.msgid)
            fd.append("roomid", g_roomid)
            fd.append("senderid", rq.senderid)
            fd.append("sendernm", rq.sendernm)
            fd.append("receiverid", rq.receiverid.join(hush.cons.easydeli))
            fd.append("receivernm", rq.receivernm.join(hush.cons.easydeli))
            fd.append("type", rq.type)
            fd.append("reply", getMsgToReply())
            fd.append("file", blobOrFilestate)
            hush.http.ajaxFormData(hush.cons.route + "/proc_image", fd, (rs) => {
                if (rs.code == hush.cons.result_ok) {
                    const rqNotice = initMsg()
                    rqNotice.type = "notice"
                    rqNotice.body = rq.type
                    rqNotice.prevmsgid = rq.msgid
                    if (hush.webview.ios) { 
                    } else if (hush.webview.and) {
                        AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rqNotice), g_roomid, "parent", false) //procMsg=false
                    } else {
                        hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rqNotice, g_roomid, "parent")
                    }
                } else {
                    procFailure(rq, rs.msg)
                }
            }, (msg) => {
                procFailure(rq, msg)
            })
        } else if (type == "flink") {
            rq.type = type
            rq.body = blobUrlOrBody
            rq.reply = getMsgToReply()
            rq.filestate = blobOrFilestate
            procSendAndAppend(rq)
        } else {
            rq.type = "talk"
            let _body = g_in_chat.val() //while (_body.endsWith(_body, "\n")) { const _len = _body.length; _body = _body.substring(0, _len - 1) } //infinite loop when _len is 0
            if (_body == "") return
            if (hush.util.utf8StrByteLength(_body) > hush.cons.max_msg_len) {
                hush.msg.toast("Maximum length of message is " + hush.cons.max_msg_len + "bytes. <br>Now is " + hush.util.utf8StrByteLength(_body) + "bytes.")
                return
            }
            rq.body = _body
            rq.reply = getMsgToReply()
            procSendAndAppend(rq)
        }
    } catch (ex) {
        hush.msg.alert("sendMsg: " + ex.message)
    }
}

const imageSrcEvent = (blobUrl, msgid, kind, type, body) => {
    const _img = $("#img_" + msgid)
    _img.attr("src", blobUrl)
    if (kind == "result") {
        _img.on("load", () => { 
            _img.show()
            scrollToTarget(0)
        })
    } else if ($(".more").length > 0) {
        _img.on("load", () => { 
            _img.show() //scrollToTarget(".more") //never call here. call at hush.cons.sock_ev_qry_msglist instead
        })
    } else { //equals to if (data.dt == FIRST_QUERIED)
        _img.on("load", () => { 
            _img.show()
            if (!g_stopAutoScrollDown) scrollToTarget()
        })
    }
    _img.on("click", function(e) {
        const _id = this.id
        let fileInfoForMobile = $("#ahref_" + msgid).attr("param1") + hush.cons.deli + $("#ahref_" + msgid).attr("param2")
        if (type == "ext_video") {
            const _arr = body.split(hush.cons.deli)
            const _path = _arr[0]
            let _witdh, _height
            if (_arr.length >= 4) {
                _witdh = parseInt(_arr[2])
                _height = parseInt(_arr[3])
            } else {
                _witdh = 500
                _height = 500
            }
            const urlStr = hush.cons.app + "/popup?type=play&msgid=" + msgid + "&path=" + encodeURIComponent(_path)
            if (hush.webview.ios) {
            } else if (hush.webview.and) {
                AndroidRoom.openPopup(urlStr, fileInfoForMobile)
            } else {
                hush.util.winopen(urlStr, _witdh, _height)
            }
        } else {
            if (!hush.webview.on) {
                const imgWin = window.open("", "", "width=800,height=800,menubar=no,status=no,toolbar=no,resizable=yes,location=no");
                imgWin.document.write("<!DOCTYPE html><html><title>Image Preview</title><body topmargin=0 leftmargin=0 marginheight=0 marginwidth=0><img id=" + _id + " ></body></html>")
                imgWin.document.getElementById(_id).setAttribute("src", this.src)
            } else {
                let _type
                if (type == "ext_image") {
                    _type = type
                } else {
                    _type = "image"
                    fileInfoForMobile = ""
                }
                const urlStr = hush.cons.app + "/popup?type=" + _type + "&msgid=" + msgid + "&body=" + body
                if (hush.webview.ios) {
                } else if (hush.webview.and) {
                    AndroidRoom.openPopup(urlStr, fileInfoForMobile)
                }
            }
        }
        e.stopPropagation()
    })
    $("#play_" + msgid).on("click", function(e) {
        $("#img_" + msgid).click()
    })
    if (type == "ext_video") $("#play_" + msgid).show()
}

const procOpengraph = async (msgid, kind) => {
    try {
        const _url = $("#openGraph" + msgid).attr("og")
        if (!_url) return
        const rs = await hush.http.ajax(hush.cons.route + "/get_opengraph", { msgid : msgid, url : _url }) 
        const ret = rs.result
        if (!ret.ogTitle) {
            $("#ogTitle" + ret.msgid).hide()
        } else {
            $("#ogTitle" + ret.msgid).html(ret.ogTitle)
        }
        if (!ret.ogDesc) {
            $("#ogDesc" + ret.msgid).hide()
        } else {
            $("#ogDesc" + ret.msgid).html(ret.ogDesc)
        }
        if (!ret.ogImg) {
            $("#ogImg" + ret.msgid).hide()
        } else {	
            $("#openGraph" + ret.msgid).show() //show() let promise resolve() for image load when qry_msglist()				
            $("#ogImg" + ret.msgid).attr("src", ret.ogImg)                        
            $("#ogImg" + ret.msgid).on("load", function() { //##02
                $("#openGraph" + ret.msgid).show()
                const _h_title = (ret.ogTitle) ? $("#ogTitle" + ret.msgid).height() : 0
                const _h_desc = (ret.ogDesc) ? $("#ogDesc" + ret.msgid).height() : 0
                const _h_img = $("#ogImg" + ret.msgid).height()
                $("#openGraph" + ret.msgid).height(_h_title + _h_desc + _h_img)
                if (kind == "result") {
                    scrollToTarget(0)
                } else if ($(".more").length > 0) {
                    //scrollToTarget(".more") //never call here. call at [hush.cons.sock_ev_qry_msglist] instead
                } else {
                    if (!g_stopAutoScrollDown) scrollToTarget() //equals to if (data.dt == FIRST_QUERIED)
                }                              
            })
        }
        if (ret.ogImg || ret.ogTitle || ret.ogDesc) {
            $("#openGraph" + ret.msgid).click(function() { openLink(ret.url) })
            if (!ret.ogImg) {
                const _h_title = (ret.ogTitle) ? $("#ogTitle" + ret.msgid).height() : 0
                const _h_desc = (ret.ogDesc) ? $("#ogDesc" + ret.msgid).height() : 0
                $("#openGraph" + ret.msgid).height(_h_title + _h_desc)	
                if (kind == "result") {
                    scrollToTarget(0)
                } else if ($(".more").length > 0) {
                    //scrollToTarget(".more") //never call here. call at [hush.cons.sock_ev_qry_msglist] instead
                } else {
                    if (!g_stopAutoScrollDown) scrollToTarget() //equals to if (data.dt == FIRST_QUERIED)
                }
            }
        }
    } catch (ex) { 
        hush.msg.alert("procOpengraph: " + ex.message)
    }
}

const handleFileUpload = (files) => {		
    const _len = files.length
    if (_len > hush.cons.max_filecount) {
        hush.msg.alert("Uploading files is up to " + hush.cons.max_filecount + " files.")
        return
    }
    if (!hush.auth.chkRole(g_role, hush.cons.group_ay) && !hush.auth.chkRole(g_role, hush.cons.group_main)) { //Checked on server, too.
        let _list = ""
        for (let i = 0; i < _len; i++) {
            if (files[i].size > hush.cons.max_filesize) _list += files[i].name + "(" + hush.util.formatBytes(files[i].size) + ") "  
        }
        if (_list != "") {
            hush.msg.alert("File size exceeded. (max:" + hush.util.formatBytes(hush.cons.max_filesize) + ")<br>" + _list)
            return
        }
    }
    for (let i = 0; i < _len; i++) {
        const rq = initMsg()
        rq.type = "file"
        rq.body = files[i].name + hush.cons.deli + files[i].size
        procSendAndAppend(rq)
        $("#pb_" + rq.msgid).show()
        const fd = new FormData()
        fd.append("msgid", rq.msgid)
        fd.append("roomid", g_roomid)
        fd.append("senderid", rq.senderid)
        fd.append("sendernm", rq.sendernm)
        fd.append("receiverid", rq.receiverid.join(hush.cons.easydeli))
        fd.append("receivernm", rq.receivernm.join(hush.cons.easydeli))
        fd.append("body", files[i].size)
        fd.append("type", rq.type)
        fd.append("reply", getMsgToReply())
        fd.append("file", files[i])
        const ajaxObj = $.ajax({url: hush.cons.route + "/proc_file",
            data : fd,
            processData : false,
            enctype : "multipart/form-data",
            contentType : false,
            cache : false,
            type : "POST",
            xhr: function() { //XMLHttpRequest redefine
                const xhr = $.ajaxSettings.xhr()
                let _started = false
                xhr.upload.onprogress = function(e) {
                    const percent = e.loaded * 100 / e.total
                    $("#pb_" + rq.msgid).val(percent)
                    const _percent = parseInt(percent)
                    $("#expiry_" + rq.msgid).html(_percent.toString() + "%")
                    if (!_started) {
                        _started = true
                        $("#abort_" + rq.msgid).show()
                        $("#sel_" + rq.msgid).removeClass("chkboxSel")
                    }
                }
                return xhr
            },
            success : function(rs) {
                $("#abort_" + rq.msgid).hide()
                if (!$("#sel_" + rq.msgid).hasClass("chkboxSel")) $("#sel_" + rq.msgid).addClass("chkboxSel")
                if (rs.code == hush.cons.result_ok) {
                    const rqNotice = initMsg()
                    rqNotice.type = "notice"
                    rqNotice.body = rq.type
                    rqNotice.prevmsgid = rq.msgid
                    if (hush.webview.ios) { 
                    } else if (hush.webview.and) {
                        AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rqNotice), g_roomid, "parent", false) //procMsg=false
                    } else {
                        hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rqNotice, g_roomid, "parent")
                    }
                } else {
                    procFailure(rq, rs.msg)
                }
            },
            error : function(xhr, status, error) { 
                $("#abort_" + rq.msgid).hide()
                const msg = hush.http.getErrorMsg(status, error)
                procFailure(rq, msg)
            }
        })
        $("#abort_" + rq.msgid).off("click").on("click", function() {
            if ($(this).html() != "Abort") {
                hush.msg.alert("Can't abort (Upload is being done). Use 'Revoke' on CellMenu")
                return
            }
            if (ajaxObj) ajaxObj.abort()
            setTimeout(() => { $("#msg_" + rq.msgid).remove() }, 1000)
            //Aborted file has to be deleted, but garbage is left when closing window during file upload so that all together should be deleted though daemon.
            //원래 전송중취소시 생긴 파일도 삭제해야 하나 브라우저창 닫기로 인한 가비지는 데몬으로 처리해야 하므로 모두 합쳐서 데몬으로 처리하기로 함.
        })
    }
}

const openLink = (url) => { //window.open(url, "_blank", "width=800,height=800,menubar=yes,status=yes,toolbar=yes,resizable=yes,location=yes");
    window.open(url, "_blank") //popup not worked for 'going back' navigation
}

const procFileLinkIfExists = (obj, kind) => {
    const _fileStr = obj.body.split(hush.cons.deli)
    const _filepath = _fileStr[0].split("/")
    const _filenameLong = _filepath[_filepath.length - 1]
    const _brr = _filenameLong.split(hush.cons.subdeli) //original_filename_body + hush.cons.subdeli + 20191016081710239944.mp4
    let _filelink, _sublink_request, _extension
    if (_brr.length > 1) { //if not, it's from sender of client
        const _crr = _brr[1].split(".")
        const _filename = (_crr.length > 1) ? _brr[0] + "." + _crr[1] : _brr[0] //original_filename_body.mp4                    
        if (obj.filestate == hush.cons.file_expired) {
            _filelink = _filename
        } else {
            let _dir_prefix = ""
            for (let i = 0; i < _filepath.length - 1; i++) _dir_prefix += _filepath[i] + "/"
            const _attr = "target='_self' style='text-decoration:none;color:#005192;cursor:pointer'"
            const _path = _dir_prefix + encodeURIComponent(_filenameLong)
            _filelink = "<a id=ahref_" + obj.msgid + " param1='" + _path + "' param2='" + obj.msgid + "' " + _attr + ">" + _filename + "</a>"
        }
        _sublink_request = obj.body //_fileStr[0]
        _extension = _crr[1]
    } else { //from sender of client
        _filelink = _filenameLong //temporary file path when being uploaded
    }
    if (_sublink_request) { //request sublink image for file uploaded : data table for file might not be inserted yet.
        if (hush.cons.sublink_ext_image.includes(_extension) || hush.cons.sublink_ext_video.includes(_extension)) {
            const _type = hush.cons.sublink_ext_image.includes(_extension) ? "ext_image" : "ext_video"
            hush.http.ajaxCall(hush.cons.route + "/get_msginfo", { msgid : obj.msgid, body : _sublink_request }, "get", function(rsPic) {
                if (rsPic.buffer) {
                    const blobUrl = hush.http.getBlobUrlForImage(rsPic.buffer.data)
                    imageSrcEvent(blobUrl, obj.msgid, kind, _type, _sublink_request) //$("#~").attr("src", "data:image/png;base64," + data)
                }
            }, false)
        }
    }
    return _filelink
}

const procHighlight = (obj) => {
    obj.css("background", hush.cons.result_bgcolor)
    obj.effect("highlight", { color: hush.cons.result_highlight }, 2000)
}

const drawLine = (_class, _str, _id) => {
    if ($("." + _class).length > 0) $("." + _class).remove() //there'll be problems if not removed when auto scrolling
    const _idHtml = (_id) ? "id=" + _id + " " : ""
    return "<div class='" + _class + "' " + _idHtml + "style='clear:both;font-size:14px;color:maroon;padding:5px;margin:3px;text-align:center;border-top:1px solid peru'>" + _str + "</div>"
}

const toggleResult = (show) => {
    $("#result_sub").empty()
    g_list_msg.empty()
    resetEnvForScroll() //should be preceded getMsgList()
    if (show) {
        $("#btn_close_search").show() //search or etc mode              
        $("#result_sub").show()
        $("#result_cnt").show()
        $("#people_sub").hide()
        $("#people_cnt").hide()
        toggleDispMem("", true)
    } else {
        $("#btn_close_search").hide()
        $("#result_sub").hide()
        $("#result_cnt").hide()
        $("#people_sub").show()
        $("#people_cnt").show()
        $("#txt_msg_added").hide()
        $("#in_search").val("")
        if (g_show_list_people == "X") toggleDispMem("X", true)
    }
}

const dialogRoomRename = (_type) => {
    const _header = (_type == "all") ? "Change room name for every user" : "Change room name for me"
    hush.msg.inputBox("Enter new name for this chat room. <br>Enter blank for deleting room name.", g_title, { 
        "OK": function() {                             
            const _newName = hush.msg.getInput().trim()                            
            if (!hush.util.chkFieldVal(_newName, 100, false, false, "Room Name")) return
            const rq = { type : _type, roomname : _newName, userid : g_userid, roomid : g_roomid } //roomid needed since
            if (hush.webview.ios) { 
            } else if (hush.webview.and) {
                AndroidCom.send(hush.cons.sock_ev_rename_room, JSON.stringify(rq), g_roomid, "parent", true) //procMsg=true
            } else {
                hush.sock.send(g_socket, hush.cons.sock_ev_rename_room, rq, g_roomid, "parent") //it should be transferred to parent
            }
            hush.msg.close()
            if (hush.webview.on) showRoomMenu(false)
        }, "Cancel": function() { 
            hush.msg.close()
            if (hush.webview.on) showRoomMenu(false)
        } 
    }, _header, 320)
}

function procInvite(useridArr, usernmArr) { //invoked from index.html (invite) popup or mobile, too
    if (useridArr.length == 0) return
    const rq = { userids : useridArr, usernms : usernmArr, sendernm : g_usernm }
    if (hush.webview.ios) { 
    } else if (hush.webview.and) { 
        AndroidCom.send(hush.cons.sock_ev_invite_user, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
    } else {
        hush.sock.send(g_socket, hush.cons.sock_ev_invite_user, rq, g_roomid)
    }
}

const procUnreadCount = (msgid, unread_cnt) => {
    if (unread_cnt == -1) return //no record 
    const objHandling = $("#handling_" + msgid)
    if (objHandling.css("display") != "none") objHandling.hide()
    const objUnread = $("#unread_" + msgid)
    if (objUnread.css("display") == "none") objUnread.show()
    const unreadStr = objUnread.html()
    const cnt_ori = parseInt(unreadStr) //unreadStr.startsWith("+") ? hush.cons.max_unread_cnt + 1 : parseInt(unreadStr)
    const cnt = parseInt(unread_cnt)                    
    if (cnt >= cnt_ori) return //unreads count should not be bigger than old one
    if (objUnread.hasClass("failure")) objUnread.removeClass("resend")
    let cntStr = (cnt == 0 ? "" : cnt)
    objUnread.html(cntStr)
    if (cnt == 0) $("#msg_" + msgid).removeClass("needCheckUnread")
}

const chkStickyNeeded = () => {
    const _isBottom = g_list_msg.prop("scrollHeight") - g_list_msg.height() - g_list_msg.scrollTop()
    if ((_isBottom >= -10 && _isBottom <= 10) && $("#btn_close_search").css("display") == "none") {
        return false //with alpha consider with browser zooming. not search mode but normal
    } else {
        return true
    }
}

const setTitleToFrTip = (doItNow) => { //for mobile only
    const frTip = $("#fr_tip")
    if (doItNow ||frTip.html() == "" || frTip.html().includes("RoomName:")) frTip.html("<span style='line-height:20px'>RoomName: " + g_title)
}

const showRoomMenu = (show) => { //for mobile only
    if (!hush.webview.on) return
    const people_m = $("#btn_people_m")
    const menu = $("#list_menu_m")
    const people = $("#list_people")
    if (show) {
        people_m.hide()
        people.hide()
        menu.show()
    } else {
        people_m.show()
        if (g_show_list_people == "") people.show()
        menu.hide()
    }
}

const toggleDispMem = (value, notRecall) => { //show = "" or "X"
    if (value == "" || !hush.webview.on) {
        $("#list_people").show()
        $(".plate").css("margin-right", "2px")
    } else { //"X"
        $("#list_people").hide()
        $(".plate").css("margin-right", "0px")
    }
    if (!notRecall) g_show_list_people = value
    setTitleToFrTip()
}

const chkTyping = () => {
    if (sockConnected) { //instaed of socket.volatile.emit()
        const curTyping = g_in_chat.val().trim()
        const disp = $("#typing_" + g_userid).css("display")
        let rq
        if (disp == "none") {
            if (curTyping) rq = { typing : true, userid : g_userid }
        } else {
            if (!curTyping) rq = { typing : false, userid : g_userid }
        }
        if (rq) {
            if (hush.webview.ios) {
            } else if (hush.webview.and) {
                AndroidCom.send(hush.cons.sock_ev_chk_typing, JSON.stringify(rq), g_roomid, null, false) //procMsg=false
            } else {
                hush.sock.send(g_socket, hush.cons.sock_ev_chk_typing, rq, g_roomid)
            }
        }
    }
    setTimeout(() => chkTyping(), 3000)
}

const calcBytes = () => {
    const cnt = hush.util.utf8StrByteLength(g_in_chat.val())
    $("#fr_byte").html(cnt + "/" + hush.cons.max_msg_len)
    if (cnt >= hush.cons.max_msg_len) {
        if ($("#fr_byte").css("color") != "red") $("#fr_byte").css("color", "red")
    } else {
        if ($("#fr_byte").css("color") != "black") $("#fr_byte").css("color", "black")
    }
}

const updateAsRevoked = (msgid) => {
    $("#body_" + msgid).html(hush.cons.cell_revoked)
    $("#img_" + msgid).remove()
    $("#play_" + msgid).remove()
    $("#openGraph" + msgid).remove()
}

const openRoomWithMobile = () => {
    if (g_type == "open") {
        const rq = { from : g_origin, userid : g_userid }
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_open_room, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
        }
    } else {
        hush.msg.alert("Please close this chat room and open again.")
    }
}

function OnSearch(input) {
    if (input.value == "") {
        $("#btn_close_search").click()
    }
}

var funcSockEv = { //needs to be public //console.log(JSON.stringify(data))
    [hush.cons.sock_ev_chk_alive_simple] : (data) => { //[...]
        for (let item of data) hush.people.toggleDisplay(item, true)
        if (g_inviteWin && !g_inviteWin.closed) g_inviteWin.funcSockEv[hush.cons.sock_ev_chk_alive_simple].call(null, data)
    },
    [hush.cons.sock_ev_show_off] : (userkey) => { 
        hush.people.toggleDisplay(userkey, false)
        if (g_inviteWin && !g_inviteWin.closed) g_inviteWin.funcSockEv[hush.cons.sock_ev_show_off].call(null, userkey)
    },
    [hush.cons.sock_ev_show_on] : (userkey) => { 
        //If User A's chatroom is already open and User B(as same room member) just connected, room_join needed.
        //A사용자 채팅창이 이미 열려 있고 B(같은 방 멤버)가 이제 막 연결된 경우 room_join이 필요.
        const rq = { from : hush.cons.sock_ev_show_on, userid : g_userid }                 
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_open_room, JSON.stringify(rq), g_roomid, null, false) //procMsg=false
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_open_room, rq, g_roomid)
        }
        hush.people.toggleDisplay(userkey, true)
        if (g_inviteWin && !g_inviteWin.closed) g_inviteWin.funcSockEv[hush.cons.sock_ev_show_on].call(null, userkey) 
    },
    [hush.cons.sock_ev_create_room] : (data) => {
        let rq
        if (data.from == "dupchk") { //Same members' room found so, that room should be opened.
            g_roomid = data.roomid
            const rqPut = { type : "set_roomid", roomid : g_roomid }
            if (hush.webview.ios) {
            } else if (hush.webview.and) {
                AndroidRoom.putData(JSON.stringify(rqPut))
            } else {
                delete opener.hush.sock.rooms[data.prevroomid] //No more use for object of previous roomid.
                opener.hush.sock.rooms[g_roomid] = g_self //new object of this window
            }
            rq = { from : data.from, userid : g_userid }
        } else {
            rq = { from : "create", userid : g_userid }
        }
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_open_room, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_open_room, rq, g_roomid)
        }
    },
    [hush.cons.sock_ev_open_room] : (data) => { //from=create,dupchk,portal,noti,rename_room,hush.cons.sock_ev_show_on
        sockConnected = true //for mobile only
        if (data.from == hush.cons.sock_ev_show_on) return
        setMembers(data) //console.log(JSON.stringify(data)+"===")
        toggleDispMem(data.dispmem)
        if (data.from == "rename_room" || data.from == "after") return
        hush.idb.connect(() => {
            getMsgList() //setTimeout(() => getMsgList(), 3000) //set 3000 for debugging (F12) 
        })
    },
    [hush.cons.sock_ev_set_env] : async (data) => {
        toggleDispMem(data.value)
    },
    [hush.cons.sock_ev_send_msg] : (data) => {
        if (data.roomid != g_roomid) {
            hush.msg.alert("Different RoomID : " + data.roomid + "/" + g_roomid)
            return
        }
        if (data.senderkey == g_userkey) deleteLocalMsg(data.msgid)
        let _isStickyNeeded
        if (data.senderkey && data.senderkey != g_userkey) { 
            _isStickyNeeded = chkStickyNeeded()                   
            if (_isStickyNeeded) {
                g_msgUnread.push(data)
                const _tag = $("#txt_msg_added")                        
                _tag.html(g_msgUnread.length + " message(s) newly arrived. Check this out.")
                if (g_msgUnread.length == 1) {
                    _tag.show()
                    _tag.off("click").on("click", function() {
                        $(this).hide()
                        if ($("#btn_close_search").css("display") != "none") {
                            $("#btn_close_search").click()
                        } else {
                            $(".markUnread").remove()
                            const _html = drawLine("markUnread", "Belows are unreads")
                            $(_html).insertBefore("#msg_" + g_msgUnread[0].msgid)
                            g_msgUnread = []
                            scrollToTarget()
                            updateAllUnreads()
                        }
                    })
                }
                if ($("#btn_close_search").css("display") != "none") return //mode : search or etc or result
            } else {
                g_msgUnread = []
            }
        }
        let _dt = hush.util.tzDateTime(data.cdt)
        _dt = hush.util.formatMsgDt(_dt, g_year)
        if (data.type == "check") { //from socket.emit (not room broadcast)
            if (data.errcd == hush.cons.result_err) {
                procFailure(data, "check failure : " + data.errmsg)
                return
            }
            if (data.body == 0) { //this almost means that sending failed
                procFailure(data, "Message not sent due to unknown problem.")
                return
            } else { //In fact, this line should not be executed since socket already returns result for this former request
                $("#msg_" + data.msgid).addClass("needCheckUnread")
                $("#dt_" + data.msgid).html(_dt)
                $("#unread_" + data.msgid).removeClass("failure").addClass("unread")
                const rq = { type : "update", msgid : data.msgid, receiverid : g_userid }
                if (hush.webview.ios) { 
                } else if (hush.webview.and) {
                    AndroidCom.send(hush.cons.sock_ev_read_msg, JSON.stringify(rq), g_roomid, null, false) //procMsg=false
                } else {
                    hush.sock.send(g_socket, hush.cons.sock_ev_read_msg, rq, g_roomid)
                }
            }
        } else if (data.type == "invite") {
            if (data.errcd == hush.cons.result_err) {
                procFailure(data, data.errmsg)
                return
            }
            setMembers(data)
            setTitleToFrTip(true)
            addRow(data)
            if (!_isStickyNeeded) scrollToTarget()
        } else if (data.type == "leave") {                    
            if (data.errcd == hush.cons.result_err) {
                procFailure(data, data.errmsg)
                return
            }
            if (data.reply) {
                if (data.reply == g_userid) { //make leave
                    if (hush.webview.ios) {
                    } else if (hush.webview.and) {
                        AndroidRoom.closeRoom()
                    } else {
                        window.close()
                    }
                } else {
                    setMembers(data)
                    setTitleToFrTip(true)
                    addRow(data)
                    if (!_isStickyNeeded) scrollToTarget()
                }
            } else {
                if (data.senderid == g_userid) { //leave
                    if (hush.webview.ios) {
                    } else if (hush.webview.and) {
                        AndroidRoom.closeRoom()
                    } else {
                        window.close()
                    }
                } else {
                    setMembers(data)
                    setTitleToFrTip(true)
                    addRow(data)
                    if (!_isStickyNeeded) scrollToTarget()
                }
            }
        } else {
            if (data.errcd == hush.cons.result_err) {
                procFailure(data, data.errmsg)
                return
            }
            let _msgArrived = false
            if (data.senderkey != g_userkey) {
                addRow(data)
                procForCell(data)
                if (!_isStickyNeeded) scrollToTarget()
                _msgArrived = true
            } else {
                if ($("#dt_" + data.msgid).length > 0) {
                    $("#dt_" + data.msgid).html(_dt)
                    if (data.type == "file" || data.type == "flink") {
                        const _filelink = procFileLinkIfExists(data)
                        $("#filelink_" + data.msgid).html(_filelink)
                        $("#pb_" + data.msgid).hide()
                        const _expiry = hush.util.getExpiryWithTZ(data.filestate, g_year)
                        $("#expiry_" + data.msgid).html(_expiry) //data.filestate == hush.cons.file_expired ? data.filestate : "until " + data.filestate) //expiry comes from server
                    }
                    procForCell(data)
                    _msgArrived = true
                }
            }
            if (!_isStickyNeeded && _msgArrived && (document.hasFocus() || g_focus_for_webview)) { //type = update or query
                const rq = { type : "update", roomid : g_roomid, msgid : data.msgid, receiverid : g_userid }
                if (hush.webview.ios) { 
                } else if (hush.webview.and) { 
                    AndroidCom.send(hush.cons.sock_ev_read_msg, JSON.stringify(rq), g_roomid, "parent", false) //procMsg=false
                } else {
                    hush.sock.send(g_socket, hush.cons.sock_ev_read_msg, rq, g_roomid, "parent")
                }
            }
        }
    },
    [hush.cons.sock_ev_read_msg] : (data) => {
        if (data.type == "updateall") {
            //data.first_queried means that procQueryUnread() will be occurred in scroll event too, so it should be skipped here.
            //Since "updateall" is broadcast, procQueryUnread() needed unless it's same userkey.
            if (data.senderkey != g_userkey || !data.first_queried) procQueryUnread()
        } else if (data.type == "getmembers") { //socket.emit
            const len = data.unread_list.length
            if (len == 0) return
            let arrUnreads = []
            for (let i = 0; i < len; i++) arrUnreads.push(data.unread_list[i].RECEIVERNM)
            hush.msg.alert(arrUnreads.join(hush.cons.memdeli), null, "people unread")
        } else if (data.type == "update") {
            procUnreadCount(data.msgid, data.unread_cnt)
        } else { //query
            for (let i = 0; i < data.msgidArr.length; i++) {
                procUnreadCount(data.msgidArr[i], data.unreadArr[i])
            }
        }
    },
    [hush.cons.sock_ev_qry_msgcell] : (data) => { //when drag&dropped
        if (data.result.length == 0) {
            hush.msg.alert("no data for " + data.msgid)
            return
        }                 
        const rs = data.result[0] //console.log(g_roomid+"==="+rs.ROOMID) //hush.msg.toast("pasting " + rs.TYPE + "..") 
        if (rs.TYPE == "image") {
            if (rs.BUFFER == null) {
                hush.msg.alert("no image data to send")
                return
            }
            if (hush.webview.ios) {
            } else if (hush.webview.and) { //rs.BUFFER not good since it is transmitted through Android App->WebView.
                hush.http.ajaxCall(hush.cons.route + "/get_msginfo", { msgid : data.msgid }, "get", function(rsPic) {
                    if (rsPic.buffer) {
                        const uInt8Array = new Uint8Array(rsPic.buffer.data)
                        const blob = new Blob([uInt8Array], { type: "image/png" })
                        const blobUrl = URL.createObjectURL(blob)
                        $("#imgplate").html("<img id=imgbody src=" + blobUrl + " style='width:100%;height:100%'>") 
                        showImgMenu(true)
                        $("#btn_send_img_m").off("click").on("click", function(e) { sendMsg("image", blobUrl, blob) })
                        $("#btn_cancel_img_m").off("click").on("click", function(e) { showImgMenu(false) })
                    }
                }, false)
            } else { 
                const uInt8Array = new Uint8Array(rs.BUFFER)
                const blob = new Blob([uInt8Array], { type: "image/png" })
                const blobUrl = URL.createObjectURL(blob)
                $("#imgplate").html("<img id=imgbody src=" + blobUrl + " style='width:100%;height:100%'>") 
                showImgMenu(true)
                $("#btn_send_img").off("click").on("click", function(e) { sendMsg("image", blobUrl, blob) })
                $("#btn_cancel_img").off("click").on("click", function(e) { showImgMenu(false) })
            }                    
        } else if (rs.TYPE == "file" || rs.TYPE == "flink") {
            hush.msg.alert("You are about to send " + hush.util.extractFileFromTalkBody(rs.BODY), {  
                "Send": function() { 
                    hush.msg.close() 
                    sendMsg("flink", rs.BODY, rs.FILESTATE)
                }, "Cancel": function() { 
                    hush.msg.close()
                } 
            }, "Confirm")
        } else {
            if (rs.BODY.trim() == "") {
                hush.msg.alert("no text data to send")
                return
            }
            g_in_chat.val(rs.BODY)
        }
    },
    [hush.cons.sock_ev_revoke_msgcell] : (data) => {
        updateAsRevoked(data.msgid)
    },
    [hush.cons.sock_ev_delete_msg] : (data) => {
        if (data.type == "all") {
            hush.msg.toast("all messages in this chat room deleted")
            g_list_msg.empty()                    
        } else {
            const _msgidArr = data.msgidArr
            const _len = _msgidArr.length
            for (let i  = 0; i < _len; i++) $("#msg_" + _msgidArr[i]).remove()
            showCellMenu(false)                    
        }
    },
    [hush.cons.sock_ev_invite_user] : (data) => {
        if (data.invitedUserids.length == 0) {
            hush.msg.toast("No one invited or the invited alredy exists.")
            return
        }
        const rq = initMsg()
        rq.type = "invite"
        rq.body = data.invitedUsernms.join(hush.cons.memdeli) + hush.cons.deli + data.invitedUserids.join(hush.cons.memdeli) + hush.cons.deli + data.sendernm
        rq.receiverid = data.receiverid
        rq.receivernm = data.receivernm
        rq.userkeys = data.userkeys
        rq.roomnm = data.roomnm
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_send_msg, JSON.stringify(rq), g_roomid, "parent", true) //procMsg=true
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_send_msg, rq, g_roomid, "parent")
        }
    },
    [hush.cons.sock_ev_rename_room] : (data) => {
        const rq = { from : "rename_room", userid : g_userid }
        if (hush.webview.ios) {
        } else if (hush.webview.and) {
            AndroidCom.send(hush.cons.sock_ev_open_room, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
        } else {
            hush.sock.send(g_socket, hush.cons.sock_ev_open_room, rq, g_roomid)
        }
    },
    [hush.cons.sock_ev_chk_typing] : (data) => {
        if (data.typing) {
            $("#typing_" + data.userid).show()
            $("#abcd_" + data.userid).hide()
        } else {
            $("#typing_" + data.userid).hide()
            if ($("#abcd_" + data.userid).html() != "") $("#abcd_" + data.userid).show()
        }
    },
    [hush.cons.sock_ev_disconnect] : (data) => { //mobile only
        sockConnected = false
        $("#img_disconn").show() //hush.msg.toast("disconnected", false, true)
    },
    [hush.cons.sock_ev_mark_as_connect] : (data) => { //mobile only
        $("#img_disconn").hide() //hush.msg.toastEnd()
    },
    [hush.cons.sock_ev_connect] : (data) => { //mobile only
        try {
            sockConnected = true
            $("#img_disconn").hide() //hush.msg.toastEnd()
            const arr = $(".talk").last()
            if (arr.length == 0) return
            getMsgList("after", $(arr[0]).attr("id").substring(4)) //msgid. after = after reconnect
            AndroidCom.reconnectDone()
        } catch (ex) {
            hush.msg.alert("sock_ev_connect: " + ex.message)
        }
    }
}

////////////////////////////////////////////////////////////////////////mobile webview
const startFromWebView = async (from, obj, rs) => {
    try {
        hush.auth.setCookieForUser(obj, "Y", true)
        hush.user = hush.auth.setUser()
        g_userkey = hush.user.key 
        g_userid = hush.user.id
        g_usernm = hush.user.nm
        g_orgcd = hush.user.orgcd
        g_token10 = hush.user.token.slice(-10)
        g_role = hush.user.role
        if (g_type == "newFromMain") {
            if (hush.webview.ios) { 
            } else if (hush.webview.and) { 
                AndroidCom.send(hush.cons.sock_ev_create_room, JSON.stringify(rs), g_roomid, null, true) //procMsg=true
            }
        } else if (g_type == "newFromPopup") {
            //see btn_new in chat.html
        } else if (g_type == "me") {    
            //see btn_me in chat.html
        } else if (g_type == "open") {
            openRoomWithMobile(g_type)
        }
        if (rs && rs.msgidCopied) {
            $("#fr_tip").hide()
            $("#fr_sendcopy").show()
        }
        procScrollEvent()
        chkTyping()
        AndroidRoom.doneLoad()
    } catch (ex) {
        hush.msg.alert("startFromWebView: " + ex.message)
    }
}

const getFromWebViewSocket = (from, json) => {
    try {
        if (!funcSockEv || !funcSockEv[json.ev]) return //Every event data object comes here even if it is not defined in this page. 
        funcSockEv[json.ev].call(null, json.data)
    } catch (ex) {
        hush.msg.alert("room:getFromWebViewSocket: (" + JSON.stringify(json) + ")\n" + ex.message)
    }
}

const setFocusFromWebView = (from, focus) => {
    g_focus_for_webview = focus //when first loaded in webview, document.hasFocus() not working for read_msg(update). g_focus_for_webview is solution for that.
}

const updateAllUnreadsFromWebView = (from, first_queried) => {
    updateAllUnreads(first_queried)
}

const scrollToBottomFromWebView = (from) => {
    scrollToTarget()
}

const invite = (from, obj) => { 
    procInvite(obj.userids.split(hush.cons.deli), obj.usernms.split(hush.cons.deli))
}
      
const pasteFromWebView = (from, obj) => {
    const rq = { msgid : obj.msgidCopied }
    if (hush.webview.ios) {
    } else if (hush.webview.and) { //it's text
        AndroidCom.send(hush.cons.sock_ev_qry_msgcell, JSON.stringify(rq), g_roomid, null, true) //procMsg=true
    }
}
