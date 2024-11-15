import { BMapLibLuShu } from './LuShu.js'
import { Qmap } from './map.js'

const MAP_TYPE = {
  amap: 'amap',
  bmap: 'bmap',
  google: 'google'
}
/***
 * 轨迹回放-封装路书类
 * @param BMap 地图对象
 * @param map 地图实例
 * @param type 地图类型：a,b
 * @constructor
 */
export function Playback (XMap, map, type) {
  this.qmap = new Qmap({
    maptype: type,
    map: map
  }) // 地图工具实例
  this.XMap = XMap
  this.map = map
  this.type = MAP_TYPE[type] || MAP_TYPE.bmap
  this.track = null // lushu对象
  this.data = [] // 路径源数组
  this.pathData = [] // 地图路径数组
  this.route = [] // google 全部路线
  this.playMarker = null // google 小车标记
  this.playTimer = null // google timer
  this.markers = [] // 点标记
  this.startMarker = null // 起点
  this.endMarker = null // 终点
  this.speed = 0
  this.road = null // 路线
  // 路线样式
  this.lineStyle = {
    strokeColor: '#5475d2',
    strokeWeight: '8',
    strokeOpacity: '0.7',
    showDirection: true
  }
  this.enableRotation = true // 是否转向
  this.autoView = true // 是否跟随视角
  this.followLine = null // 跟随线
  this.followLinePoints = [] // 跟随线点数组
  this.colorLineAll = [] // 速度线总集合
  this.colorLinePart = null // 速度线每一小段
  this.curIndex = null // 当前点索引
  this.prevIndex = null // 上一个点索引
  this.clearPoly = [] // 待清空的覆盖物
  // 界限在
  // [低速:0<sudu<=lowSpeed]
  // [正常:lowSpeed<sudu<=overSpeed]
  // [超速:overSpeed<sudu<=(overSpeed*1.5)]
  // [超速(1.5):(overSpeed*1.5)<sudu]
  this.overSpeed = 100
  this.lowSpeed = 20
  this.speedColor = {
    // low: '#336699', // 低速
    low: '#c1c4d2', // 低速
    normal: '#00FF00', // 正常速度颜色
    // normal: '#5475d2', // 正常速度颜色
    over: '#F50713', // 超速颜色
    over1_5: '#950222' // 速度超1.5颜色
  }
  // 已播路线， isCustomColor 是否分区间展示颜色;customColorSection分区间展示颜色
  this.passedLine = {
    strokeColorDefault: '#aaa',
    strokeWeight: '8',
    strokeOpacity: '0.7',
    isCustomColor: false,
    customColorArr: ['#c1c4d2', '#00FF00', '#F50713', '#950222'],
    customColorSection: [0, 20, 100, 100 * 1.5],
    customColorField: 'speed'
  }
  this.passedRoadColor = '#aaa' // 默认运动过的线颜色
  this.showRoad = true // 是否要路线
  this.showPassedLine = true // 是否要已播路线
  this.fromPause = false // google 从暂停
  this.fromStop = false // google 从停止
  this.onMoveNext = null
  this.infoWindow = null
  this._options = {}
  // 小车图标
  if (this.type === 'amap') {
    this.icon = new XMap.Icon({
      size: new XMap.Size(52, 26),
      image: 'http://developer.baidu.com/map/jsdemo/img/car.png'
    })
    this.iconOffset = new XMap.Pixel(-26, -13)
  } else if (this.type === 'bmap') {
    this.icon = this.qmap.createIcon({
      url: 'http://developer.baidu.com/map/jsdemo/img/car.png',
      size: { width: 52, height: 26 },
      anchor: { width: 27, height: 13 }
    })
  } else if (this.type === 'google') {
    this.icon = this.qmap.createIcon({
      url: require('../assets/img/battery_marker.png'),
      anchor: { x: 15, y: 47 }
    })
  }
}
/** * lushu初始化
 * markers: XMap.Marker集合 地图上的标注
 * points：普通路线坐标点数组，用于创建路书行驶的路线点集
 * landmarkPoints: 路书行驶的landmark点集
 **/
Playback.prototype.initTrack = function (options = {}) {
  this._options = options
  // 公共参数赋值
  var { data, markers, startMarker, endMarker, passedRoadColor, enableRotation, showPassedLine, showRoad, lineStyle = {}, passedLine = {} } = options
  if (enableRotation !== undefined) this.enableRotation = enableRotation
  if (showPassedLine !== undefined) this.showPassedLine = showPassedLine
  if (showRoad !== undefined) this.showRoad = showRoad
  if (passedRoadColor !== undefined) this.passedRoadColor = passedRoadColor
  Object.assign(this.passedLine, passedLine)

  // 清空之前的地图层和覆盖物
  this.clearMap()
  // 路径数据
  this.trackHandlePath(data)
  // 添加路线
  this.TrackAddRoad(lineStyle)
  // 集中添加Markers
  this.trackAddMarkers(markers)
  // 添加起始点标记
  this.trackInitStartEndMarker(startMarker, endMarker)
  // 分类初始化
  if (this.type === 'bmap') {
    this.initBmapTrack(options)
  } else if (this.type === 'amap') {
    this.initAmapTrack(options)
  } else if (this.type === 'google') {
    this.initGmapTrack(options)
  }
  // 返回track的实例marker，有的业务不需要marker，调用者可以做删除操作
  return this.track
}
// bmap轨迹回放初始化
Playback.prototype.initBmapTrack = function (options = {}) {
  var { map } = this
  const _this = this
  var {
    landmarkPoints,
    autoView,
    content,
    icon,
    speed,
    onMoveNext
  } = options

  // 参数处理
  if (autoView !== undefined) this.autoView = autoView
  if (icon !== undefined) this.icon = icon
  if (speed !== undefined) this.speed = speed

  // 全局变量路书，如果存在则停止
  if (this.track) {
    this.track.stop()
  }

  // 视角跟随
  map.setViewport(this.pathData)

  if (this.track) {
    // 优化，重载路书时,可直接更换_path
    this.track._path = this.pathData
    return
  }
  // lushu初始化
  this.track = new BMapLibLuShu.LuShu(map, this.pathData, {
    defaultContent: content || '', // 支持html
    autoView: _this.autoView,
    icon: this.icon,
    speed: this.speed,
    enableRotation: _this.enableRotation, // 是否设置marker随着道路的走向进行转向
    landmarkPois: landmarkPoints || [],
    // 播放开始时
    onFirst () {
      _this.clearPassedOverlays()
    },
    onMoveNext (data) {
      if (onMoveNext) onMoveNext(data)
    },
    onMove (data) {
      if (_this.showPassedLine) {
        const { pos, cur } = data
        _this.drawPassedLine(pos, cur)
      }
    }
  })
}
// amap轨迹回放初始化
Playback.prototype.initAmapTrack = function (options = {}) {
  var { XMap, map, qmap } = this
  var _this = this
  var { onMoveNext, speed, icon, iconOffset, content } = options
  var pathData = []
  // 处理参数
  if (icon !== undefined) this.icon = icon
  if (iconOffset !== undefined) this.iconOffset = iconOffset && qmap.createPixel(iconOffset)
  if (speed !== undefined && !this.speed) this.speed = speed

  this.infoWindow = null

  // 设置视角
  map.setFitView([this.road])
  // amap Marker初始化
  this.track = new XMap.Marker({
    map: map,
    position: _this.pathData[0],
    autoRotation: this.enableRotation,
    icon: this.icon,
    offset: this.iconOffset,
    animation: 'AMAP_ANIMATION_DROP',
    content: content || ''
  })

  // 如果使用高德2.0
  if (window.AMapVersionUse === 2) {
    // eslint-disable-next-line no-undef

    _this.pathData.forEach((ele) => {
      pathData.push({
        position: ele,
        // duration: 400
        speed: _this.speed
      })
    })
    _this.pathData = pathData
    // 通过marker的moveAlong实行点移动
    this.track.moveAlong(pathData)
    this.pause()
  } else {
    // 通过marker的moveAlong实行点移动
    this.track.moveAlong(pathData, this.speed)
    this.pause()
  }

  // 点移动时，画速度线
  this.track.on('moving', (e) => {
    let realCurIndex = e.passedPath && e.passedPath.length - 2
    let realCurPoint = e.passedPath[realCurIndex]
    // 实时设置信息窗位置
    if (this.infoWindow) { this.infoWindow.setPosition(e.passedPath[realCurIndex + 1]) }
    // 找到当前点index
    _this.curIndex = _this.pathData.findIndex((item) => {
      return item.lng === realCurPoint.lng && item.lat === realCurPoint.lat
    })
    if (this.showPassedLine) {
      // 画速度区分线
      if (_this.curIndex !== _this.prevIndex) {
        // 每一点开始时，创建一条速度线
        this.drawPassedLine()
      } else if (_this.prevIndex === _this.curIndex) {
        // 两点之间，设置速度线路径
        if (this.colorLinePart) { this.colorLinePart.setPath(e.passedPath.slice(-2)) }
      }
    }
    _this.prevIndex = _this.curIndex
    // passedRoad.setPath(e.passedPath)
  })
  // 点所有路径结束时
  this.track.on('movealong', function (e) {
    // 回放结束 curIndex 少1
    // if (_this.curIndex >= _this.pathData.length - 2) {
    //   _this.curIndex = _this.pathData.length - 1
    // }
    // 结束时最后一个点
    _this.curIndex = _this.pathData.length - 1
    // 点击进度条最后一个点位置：处理进度条为100%，播放完成
    if (onMoveNext) {
      onMoveNext({
        e: e,
        cur: _this.pathData.length - 1
      })
    }
  })
  // 每两点之间移动结束时
  this.track.on('moveend', function (e) {
    if (onMoveNext) {
      onMoveNext({
        e: e,
        cur: window.AMapVersionUse === 2 ? e.index : _this.curIndex
      })
    }
  })
}
// google.maps轨迹回放初始化
Playback.prototype.initGmapTrack = function (options = {}) {
  var { map, qmap } = this
  var { data, showRoad, icon, speed, onMoveNext } = options

  if (showRoad !== undefined) this.showRoad = showRoad
  if (icon !== undefined) this.icon = icon
  if (speed !== undefined) this.speed = speed
  if (onMoveNext !== undefined) this.onMoveNext = onMoveNext

  qmap.setFitView({
    path: data
  })
  this.playMarker = qmap.createMarker({
    icon: this.icon,
    position: this.pathData[0],
    anchorPoint: { x: 0, y: -55 } // 信息框位置
    // zIndex:
  })
  this.playMarker.setMap(map)
  this.playMarker.setPosition(this.pathData[0])
  this.curIndex = 0
}

// 添加轨迹路线
Playback.prototype.TrackAddRoad = function (lineStyle = {}) {
  Object.assign(this.lineStyle, lineStyle)
  this.road = this.addRoad(this.lineStyle)
  if (!this.showRoad) this.hideRoadFun() // 此时bmap线上方向箭头会报错
}
// 设置信息窗
Playback.prototype.setInfoWindow = function (options = {}) {
  const { type, qmap, map, pathData } = this
  const { content, position } = options
  if (type === 'amap') {
    const { offset } = options
    if (!this.infoWindow) {
      this.infoWindow = qmap.createInfoWindow({
        content: content,
        position: this.track.getPosition(),
        offset: offset && qmap.createPixel(offset)
      })
      this.openInfoWindow(map)
    } else {
      this.infoWindow.setContent(content)
    }
  } else if (type === 'bmap') {
    this.setOption({
      defaultContent: content
    })
    let dataLen = pathData.length
    let lastPoint = pathData[dataLen - 1]
    if (this.track.i === dataLen - 1) {
      // 修复播放到最后一个点信息窗内容更新问题
      this.track._setInfoWin(lastPoint)
    }
  } else if (type === 'google') {
    if (!this.infoWindow) {
      this.infoWindow = qmap.createInfoWindow({
        content: content,
        position: position
      })
      this.openInfoWindow()
    } else {
      this.infoWindow.setContent(content)
    }
  }
}
Playback.prototype.openInfoWindow = function (options = {}) {
  const { type, qmap, infoWindow } = this
  if (type === 'amap') {
    const { point } = options
    qmap.openInfoWindow({
      infowindow: infoWindow,
      point: point
    })
  } else if (type === 'google') {
    const { playMarker } = this
    qmap.openInfoWindow({
      infowindow: infoWindow,
      marker: playMarker
    })
  }
}
Playback.prototype.closeInfoWindow = function (options = {}) {
  const { qmap, infoWindow } = this
  qmap.closeInfoWindow({
    infowindow: infoWindow
  })
}
// 通过点数组处理 地理坐标点数组
Playback.prototype.trackHandlePath = function (data) {
  const { qmap } = this
  this.data = data
  let pathData = []
  if (this.data && this.data.length > 0) {
    pathData = this.data.map((item) => {
      return qmap.createPoint(item)
    })
  }
  this.pathData = pathData
}
// 添加markers点标记
Playback.prototype.trackAddMarkers = function (markers) {
  const { qmap } = this
  if (markers !== undefined) {
    this.markers = markers
  }
  // 集中添加Markers
  if (this.markers && this.markers.length > 0) {
    this.markers.forEach((marker) => {
      qmap.addOverlay({
        overlay: marker
      })
    })
  }
}

// 添加起始点标记
Playback.prototype.trackInitStartEndMarker = function (startMarker, endMarker) {
  const { qmap, pathData } = this
  const startPoint = pathData[0]
  const endPoint = pathData[pathData.length - 1]
  // 添加起点标记
  if (startMarker !== undefined) {
    this.startMarker = startMarker
    startPoint && this.startMarker.setPosition(startPoint)
    qmap.addOverlay({
      overlay: this.startMarker
    })
  }

  if (endMarker !== undefined) {
    // 添加终点标记
    this.endMarker = endMarker
    endPoint && this.endMarker.setPosition(endPoint)
    qmap.addOverlay({
      overlay: this.endMarker
    })
  }
}
// 谷歌地图-播放
Playback.prototype.gmapPlay = function () {
  const { speed } = this
  if (!this.playMarker) return
  let _delay = Math.round((400 * 1000) / speed)
  this.drawPassedLine()
  if (this.onMoveNext) {
    this.onMoveNext({
      cur: this.curIndex
    })
  }
  // 设置点位置
  let curpos = this.pathData[this.curIndex]
  this.playMarker.setPosition(curpos)
  if (this.infoWindow) {
    this.infoWindow.setPosition(curpos)
  }
  if (this.curIndex < this.pathData.length - 1) {
    this.curIndex++
    this.playTimer = setTimeout(() => {
      this.gmapPlay()
    }, _delay)
  } else {
    clearTimeout(this.playTimer)
  }
}
Playback.prototype.setSpeed = function (speed) {
  var { type, pathData, curIndex } = this
  this.speed = speed
  if (type === 'bmap') {
    this.setOption({
      speed: this.speed
    })
  } else if (type === 'amap') {
    if (window.AMapVersionUse === 2) {
      let curpath = []
      pathData.forEach(ele => {
        let item = ele
        curpath.push({ position: item.position, speed })
      })

      this.track.moveAlong(curpath)
    } else {
      let curpath = pathData.slice(curIndex)
      this.track.moveAlong(curpath, speed)
    }
  } else if (type === 'google') {
    if (this.playTimer) {
      clearTimeout(this.playTimer)
      this.gmapPlay()
    }
  }
}
// 设置LuShu参数,
Playback.prototype.setOption = function (options = {}) {
  this.track._setOptions(options)
}
// 设置路线points, 也叫Path
Playback.prototype.setData = function (data = []) {
  const { type, speed, qmap } = this
  this.data = data
  this.pathData = data.map((item) => {
    return qmap.createPoint(item)
  })
  if (type === 'amap') {
    if (window.AMapVersionUse === 2) {
      var curpath = []
      this.pathData.forEach(ele => {
        let item = ele
        curpath.push({ position: item.position, speed })
      })
      this.track.moveAlong(curpath)
    } else {
      this.track.moveAlong(this.pathData, speed)
    }

    this.track.pause()
  } else if (type === 'bmap') {
    this.track._path = this.pathData
  }
}
// 画轨迹路线
Playback.prototype.addRoad = function (lineStyle) {
  const { type, qmap } = this
  const { strokeWeight, strokeOpacity, strokeColor, showDirection } = lineStyle
  let directionIcon = null
  let _lineStyle = {
    path: this.data,
    strokeWeight: strokeWeight,
    strokeOpacity: strokeOpacity,
    strokeColor: strokeColor || ''
  }
  // 方向箭头
  if (showDirection) {
    if (type === 'bmap') {
      let symbol = this.qmap.createSymbol({
        // SymboShapeType: window.BMap_Symbol_SHAPE_FORWARD_OPEN_ARROW,
        SymboShapeType: window.BMap_Symbol_SHAPE_BACKWARD_OPEN_ARROW,
        scale: 0.5,
        strokeColor: '#fff',
        strokeWeight: 1,
        strokeOpacity: 0.8
      })
      directionIcon = this.qmap.createIconSequence({
        symbol: symbol,
        offset: '10%',
        repeat: '12%'
      })
      _lineStyle.icons = directionIcon
    } else if (type === 'amap') {
      _lineStyle.showDir = showDirection
    } else if (type === 'google') {
      let symbol = this.qmap.createSymbol({
        SymbolPath: 'FORWARD_OPEN_ARROW',
        scale: 1.2,
        strokeColor: '#fff'
      })
      directionIcon = {
        icon: symbol,
        offset: '10%',
        repeat: '14%'
      }
      _lineStyle.icons = directionIcon
    }
  }
  // 创建线
  var road = this.qmap.createPolyline(_lineStyle)
  // 加到地图
  qmap.addOverlay({
    overlay: road
  })
  return road
}
// 开始
Playback.prototype.play = function () {
  let { type, curIndex, pathData, speed } = this

  if (type === 'amap') {
    if (curIndex === pathData.length - 1) {
      if (window.AMapVersionUse === 2) {
        var curpath = []
        pathData.forEach(ele => {
          let item = ele
          curpath.push({ position: item.position, speed })
        })
        this.track.moveAlong(curpath)
      } else {
        this.track.moveAlong(pathData, speed)
      }

      this.clearPassedOverlays()
    } else {
      this.track.resumeMove()
    }
  } else if (type === 'bmap') {
    if (this.track.i === pathData.length - 2) {
      if (pathData.length > 3) {
        // 修复最后一段暂停后走不完，退一步即可
        this.track.i = pathData.length - 3
      }
      if (pathData.length === 3) {
        // 共3点时，特殊处理
        this.track.i = 0
      }
    }
    this.track.start()
    setTimeout(() => {
      this.track.showInfoWindow()
    }, 1000)
  } else if (type === 'google') {
    if (curIndex === 0) {
      if (this.playTimer) clearTimeout(this.playTimer)
      this.gmapPlay()
    } else if (curIndex === pathData.length - 1) {
      if (this.playTimer) clearTimeout(this.playTimer)
      this.curIndex = 0
      this.clearPassedOverlays()
      this.gmapPlay()
    } else if (this.fromPause) {
      this.fromPause = false
      this.gmapPlay()
    } else if (this.fromStop) {
      this.fromStop = false
      this.curIndex = 0
      this.gmapPlay()
    }
  }
}
// 暂停
Playback.prototype.pause = function () {
  const { type } = this
  if (type === 'amap') this.track.pauseMove()
  else if (type === 'bmap') this.track.pause()
  else if (type === 'google') {
    this.fromPause = true
    if (this.playTimer) clearTimeout(this.playTimer)
  }
}
// 停止 callback停止时回调
Playback.prototype.stop = function (callback) {
  // , pathData, speed
  var { type } = this
  if (callback) {
    callback()
  }
  if (type === 'amap') {
    this.track.stopMove()

    // if (window.AMapVersionUse === 2) {
    //   var curpath = []
    //   pathData.forEach(ele => {
    //     let item = ele
    //     curpath.push({ position: item.position, speed })
    //   })
    //   this.track.moveAlong(curpath)
    // } else {
    //   this.track.moveAlong(pathData, speed)
    // }

    this.track.pauseMove()
    this.clearPassedOverlays()
    this.curIndex = 0
    this.infoWindow && this.infoWindow.setPosition(window.AMapVersionUse === 2 ? this.pathData[0].position : this.pathData[0])
  } else if (type === 'bmap') {
    this.track.stop()
  } else if (type === 'google') {
    this.fromStop = true
    clearTimeout(this.playTimer)
    this.playMarker && this.playMarker.setPosition(this.pathData[0])
    this.clearPassedOverlays()
  }
}
// 重置 callback重置时回调
Playback.prototype.replay = function (callback) {
  const { type, pathData, speed } = this
  if (callback) {
    callback()
  }
  if (type === 'amap') {
    this.track.stopMove()
    this.track.moveAlong(pathData, speed)
    this.clearPassedOverlays()
  } else if (type === 'bmap') {
    this.track.stop()
    this.track.start()
  } else if (type === 'google') {
    this.curIndex = 0
    clearTimeout(this.playTimer)
    this.gmapPlay()
    this.clearPassedOverlays()
  }
}
/***
 * 已过的线-获取点的某个字段值所在区间的颜色-用于画线
 * @param point
 * passedLine 已过的线
 * isCustomColor: 是否开启自定义颜色
 * customColorArr: 自定义颜色数组
 * customColorSection: 自定义比对区间数组
 * customColorField: 自定义字段名
 * strokeColorDefault: 默认线颜色
 * @returns {*|Playback.passedLine.strokeColorDefault}
 */
Playback.prototype.getLineColor = function (point) {
  const { passedLine } = this
  const { isCustomColor, customColorArr, customColorSection, strokeColorDefault, customColorField } = passedLine
  if (!isCustomColor) {
    return strokeColorDefault
  }
  const fieldVal = point[customColorField] // 获取字段值
  let colorIndex = 0 // 颜色索引
  for (let i = 0; i < customColorSection.length; i++) {
    let section = customColorSection[i]
    let sectionNext = customColorSection[i + 1]
    // 找字段值所在区间
    if (sectionNext) {
      if (fieldVal >= section && fieldVal < sectionNext) {
        colorIndex = i
        break
      }
    } else {
      // 若没有下个区间，则用最后一个颜色
      colorIndex = i
    }
  }
  // 确定颜色
  let color = customColorArr[colorIndex] || strokeColorDefault
  return color
}
/***
 * 根据速度画不同颜色线
 * @param pos 当前点 细化经纬度
 * @param cur 当前点 索引
 */
Playback.prototype.drawPassedLine = function (pos, cur) {
  const { type, showPassedLine, qmap, passedLine } = this
  // 是否开启
  if (!showPassedLine) return
  // 分类处理
  if (type === 'bmap') {
    if (this.prevIndex == null || cur !== this.prevIndex || this.colorLinePart === null) {
      // 刚开始 || 下一段
      let point = this.data[cur]
      let _color = this.getLineColor(point)
      this.colorLinePart = null
      this.colorLinePart = qmap.createPolyline({
        path: [this.data[cur]],
        strokeColor: _color,
        strokeOpacity: passedLine.strokeOpacity,
        strokeWeight: passedLine.strokeWeight
      })
      qmap.addOverlay({
        overlay: this.colorLinePart
      })
      this.colorLineAll.push(this.colorLinePart)
    } else if (cur === this.prevIndex) {
      // 一段之间
      if (this.colorLinePart) {
        let passedpath = this.colorLinePart.getPath()
        passedpath.push(pos)
        this.colorLinePart.setPath(passedpath)
      }
    }
    this.prevIndex = cur
  } else if (type === 'amap') {
    const { data, curIndex } = this
    let point = data[curIndex]
    let color = this.getLineColor(point)
    this.colorLinePart = null
    this.colorLinePart = qmap.createPolyline({
      strokeColor: color,
      strokeOpacity: passedLine.strokeOpacity,
      strokeWeight: passedLine.strokeWeight
    })
    qmap.addOverlay({
      overlay: this.colorLinePart
    })
    this.colorLineAll.push(this.colorLinePart)
  } else if (type === 'google') {
    const { data, curIndex } = this
    if (data[curIndex - 1]) {
      let _color = this.getLineColor(data[curIndex - 1])
      this.colorLinePart = qmap.createPolyline({
        path: [data[curIndex - 1], data[curIndex]],
        strokeColor: _color,
        zIndex: 1,
        strokeOpacity: passedLine.strokeOpacity,
        strokeWeight: passedLine.strokeWeight
      })
      qmap.addOverlay({
        overlay: this.colorLinePart
      })
      this.colorLineAll.push(this.colorLinePart)
    }
  }
}

// 去除跟随线 (速度线)
Playback.prototype.clearPassedOverlays = function () {
  var { map, type, colorLineAll } = this
  if (type === 'amap') {
    map.remove(colorLineAll)
  } else if (type === 'bmap') {
    if (this.colorLineAll && this.colorLineAll.length > 0) {
      this.colorLineAll.forEach((item) => {
        this.map.removeOverlay(item)
      })
    }
    if (this.colorLinePart) this.map.removeOverlay(this.colorLinePart)
  } else if (type === 'google') {
    if (this.colorLineAll) {
      this.colorLineAll.forEach((item) => {
        item.setMap(null)
      })
    }
  }
  this.colorLinePart = null
  this.colorLineAll = []
}
/***
 * 设置进度索引 5 就从第5个点开始播放
 * @param index 进度索引
 */
Playback.prototype.setProgress = function (index) {
  const { data, type, speed, pathData } = this
  if (type === 'amap') {
    if (index < 0) index = 0
    var path = pathData.slice(index)
    this.curIndex = index
    if (window.AMapVersionUse === 2) {
      var curpath = []
      path.forEach(ele => {
        let item = ele
        curpath.push({ position: item.position, speed })
      })
      this.track.moveAlong(curpath)
    } else {
      this.track.moveAlong(path, speed)
    }
  } else if (type === 'bmap') {
    if (index < 0) index = 0
    if (index > data.length - 3) index = data.length - 3
    if (!this.track._marker) {
      this.track.i = 0
      this.play()
      this.track.i = index
    } else {
      this.track.i = index
      this.pause()
      this.play()
    }
  } else if (type === 'google') {
    if (index < 0) index = 0
    this.curIndex = index
    if (this.playTimer) clearTimeout(this.playTimer)
    this.gmapPlay()
  }
}
/***
 * 获取进度百分比 50% 就返回50
 * @param index 进度索引
 */
Playback.prototype.getProgress = function (index) {
  const { data, type } = this
  var precent = 0
  if (type === 'amap') {
    // if (index >= data.length - 2) {
    //   precent = 100
    // } else {
    //   precent = Math.round(((index + 1) / data.length) * 100)
    // }
    precent = Math.round(((index + 1) / data.length) * 100)
  } else if (type === 'bmap') {
    precent = Math.round(((index + 1) / data.length) * 100)
  } else if (type === 'google') {
    precent = Math.round(((index + 1) / data.length) * 100)
  }
  return precent
}
// 显示轨迹
Playback.prototype.showRoadFun = function () {
  const { type } = this
  if (type === 'google') this.road && this.road.setVisible(true)
  else this.road && this.road.show()
}
// 隐藏轨迹
Playback.prototype.hideRoadFun = function () {
  const { type } = this
  if (type === 'google') this.road && this.road.setVisible(false)
  else this.road && this.road.hide()
}
/***
 * 清空地图
 * @param options
 * gmap为删除所有覆盖物
 */
Playback.prototype.clearMap = function (options = {}) {
  const { type, map } = this
  if (type === 'bmap') {
    // 清除以前存在的路书和层
    map.clearOverlays()
  } else if (type === 'amap') {
    // 清除地图覆盖物
    map.clearMap()
  } else if (type === 'google') {
    let overlays = [this.road, this.playMarker, this.startMarker, this.endMarker]
    if (this.colorLineAll) {
      overlays = [...overlays, ...this.colorLineAll]
    }
    if (this.markers) {
      overlays = [...overlays, ...this.markers]
    }
    overlays.forEach((item) => {
      item && item.setMap(null)
    })
    overlays = []
    this.markers = []
    this.infoWindow = null
    if (this.playMarker) {
      this.stop()
      this.playMarker = null
    }
  }
  this.clearPassedOverlays()
  if (this.track) {
    this.stop()
  }
}
/***
 * 重载地图
 * @param options
 */
Playback.prototype.reload = function () {
  const { _options } = this
  this.initTrack(_options)
}
/***
 * 设置新路径
 * @param options
 * gmap为删除所有覆盖物
 */
Playback.prototype.setPath = function (data) {
  this._options.data = data
  this.initTrack(this._options)
}
