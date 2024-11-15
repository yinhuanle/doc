import { bd09togcj02, gcj02tobd09, wgs84togcj02, gcj02towgs84 } from './coordinate-system-convert'
const MAP_URL = {
  bmap: 'https://api.map.baidu.com/api?v=2.0', // 百度地图
  bmap3: 'https://api.map.baidu.com/api?v=3.0', // 百度地图
  // bmap: '', // 百度地图
  // bmap3: '', // 百度地图
  amap: 'https://webapi.amap.com/maps?v=1.4.15', // 高德地图
  amap2: 'https://webapi.amap.com/maps?v=2.0', // 高德地图
  google: 'https://maps.googleapis.com/maps/api/js?' // 谷歌地图
}
let mapAk = '' // 地图秘钥
let mapType = '' // 地图秘钥
// 电子围栏相关（全局：目前针对谷歌地图，百度，谷歌不要使用该对象-避免造成全局变量污染，---用处：清覆盖物）
let drawingManager // 覆盖物
let shape
/***
 * 下载map.js
 * 加入Promise 防止js重复添加
 * @param type amap, bmap, google/gmap
 */
export function handleMapJs ({ type, ak, lang, bmapVersion }) {
  mapAk = ak
  mapType = type
  var url = ''
  if (type === 'bmap') {
    if (bmapVersion === 3) {
      url = `${MAP_URL.bmap3}&ak=${ak}&callback=bmapCallback`
    } else {
      url = `${MAP_URL[type]}&ak=${ak}&callback=bmapCallback`
    }
    if (!window.BMap) {
      // BMap不存在时
      window.BMap = {}
      window.BMap._loadPromise = new Promise((resolve) => {
        var $script = document.createElement('script')
        document.body.appendChild($script)
        $script.src = url
        $script.async = true
        window.bmapCallback = () => {
          resolve(window.BMap)
          window.bmapCallback = null
          $script = null
          window.BMap._loadPromise = null
        }
      })
      return window.BMap._loadPromise
    } else if (!window.BMap._loadPromise) {
      // BMap存在，且Promise已完成
      return Promise.resolve(window.BMap)
    } else {
      // BMap存在，且Promise加载中
      return window.BMap._loadPromise
    }
  } else if (type === 'amap') {
    if (bmapVersion === 2) { // 复用该字段（暂不新增，不修改）
      window.AMapVersionUse = 2
      url = `${MAP_URL[type + '2']}&key=${ak}&callback=amapCallback&plugin=AMap.AutoComplete,AMap.MoveAnimation`
    } else {
      window.AMapVersionUse = 1
      url = `${MAP_URL[type]}&key=${ak}&callback=amapCallback&plugin=AMap.AutoComplete`
    }
    if (!window.AMap) {
      window.AMap = {}
      window.AMap._loadPromise = new Promise((resolve) => {
        var $script = document.createElement('script')
        document.body.appendChild($script)
        $script.src = url
        window.amapCallback = () => {
          resolve(window.AMap)
          window.amapCallback = null
          $script = null
          window.AMap._loadPromise = null
        }
      })
      return window.AMap._loadPromise
    } else if (!window.AMap._loadPromise) {
      return Promise.resolve(window.AMap)
    } else {
      return window.AMap._loadPromise
    }
  } else if (type === 'google' || type === 'gmap') {
    url = `${MAP_URL[type]}key=${ak}&v=quarterly&callback=gmapCallback&libraries=drawing,geometry,places&v=weekly`
    if (lang) {
      url += `&language=${lang}`
    }
    if (!document.getElementById('ggjs')) {
      // 此处兼容ie11，ie10及以下暂不支持，可以给提示
      window.google = null
    }
    if (!window.google) {
      window.google = {}
      window.google._loadPromise = new Promise((resolve) => {
        var $script = document.createElement('script')
        document.body.appendChild($script)
        $script.charset = 'utf-8'
        $script.src = url
        $script.async = true
        $script.id = 'ggjs'
        window.gmapCallback = () => {
          resolve(window.google.maps)
          window.gmapCallback = null
          $script = null
          window.google._loadPromise = null
        }
      }).then(() => {

      })
      return window.google._loadPromise
    } else if (!window.google._loadPromise) {
      return Promise.resolve(window.google.maps)
    } else {
      return window.google._loadPromise
    }
  }
}

/***
 * 地图工具类
 * 属性、方法 （可创建map、也可传入map）
 * @param maptype amap、bmap、 后续支持google、qq
 *
 * @constructor
 */
export function Qmap (options = {}) {
  const { maptype, map } = options
  this._is = {
    BMap: false, // 百度地图
    AMap: false, // 高德地图
    GMap: false // 谷歌地图
  }
  this.QMap = null // 地图核心对象
  this.maptype = maptype // 地图类型
  this.lang = 'cn' // 默认中国
  this.map = map || null // 地图实例

  if (maptype === 'bmap') {
    this.QMap = window.BMap
    this._is.BMap = true
  } else if (maptype === 'amap') {
    this.QMap = window.AMap
    this._is.AMap = true
  } else if (maptype === 'google') {
    this.QMap = window.google.maps
    this._is.GMap = true
  }
}

/***
 * 创建各map实例
 * @param options
 * @returns {null|QMap.Map}
 */
Qmap.prototype.newMap = function (options = {}) {
  var { _is, QMap } = this
  var { elem, minZoom, maxZoom, lang } = options
  // 默认参数
  var defaults = {
    lat: {
      google: 36.87962060502676,
      bmap: 36.62060502676,
      qq: 36.62060502676,
      amap: 36.62060502676,
      msmap: 36.62060502676
    },
    lng: {
      google: 111.6015625,
      bmap: 108.6015625,
      qq: 108.6015625,
      amap: 108.6015625,
      msmap: 108.6015625
    },
    zoom: { google: 4, bmap: 4, qq: 4, amap: 3, msmap: 4 }
  }
  // 处理参数
  if (lang) {
    this.lang = lang
  }
  var dom = typeof elem === 'string' ? document.getElementById(elem) : elem
  var center = null
  // 创建各map实例
  if (_is.BMap) {
    center =
      options.center ||
      this.createPoint({
        lng: options.lng || defaults.lng.bmap,
        lat: options.lat || defaults.lat.bmap
      })
    if (lang) {
      console.log('bmap暂不支持国际化语言切换')
    }
    this.map = new QMap.Map(dom, { minZoom: 3 })
    this.map.centerAndZoom(center, defaults.zoom.bmap)
    this.map.enableScrollWheelZoom()
    this.map.enableKeyboard()
  } else if (_is.AMap) {
    center = options.center ||
      this.createPoint({
        lng: options.lng || defaults.lng.amap,
        lat: options.lat || defaults.lat.amap
      })
    let zooms = null
    if (minZoom && maxZoom) {
      zooms = [minZoom, maxZoom]
    } else if (minZoom) {
      zooms = [minZoom, 18]
    } else if (maxZoom) {
      zooms = [3, maxZoom]
    }
    let _options = {
      resizable: true,
      center: center,
      zoom: defaults.zoom.amap
    }
    if (lang) {
      _options.lang = this.lang
    }
    if (zooms) {
      _options.zooms = zooms
    }
    this.map = new QMap.Map(dom, _options)
  } else if (_is.GMap) {
    center =
      options.center ||
      this.createPoint({
        lng: options.lng || defaults.lng.google,
        lat: options.lat || defaults.lat.google
      })
    this.map = new QMap.Map(dom, {
      center: center,
      zoom: options.zoom || defaults.zoom.google,
      mapTypeId: QMap.MapTypeId.ROADMAP,
      minZoom: minZoom,
      maxZoom: maxZoom
    })
    // 控件可通过map.setOptions或者Qmap.prototype.setOptions设置
  }
  return this.map
}
// 设置地图属性 (google地图)
Qmap.prototype.setOptions = function (options = {}) {
  const { _is, map } = this
  if (_is.GMap) {
    map.setOptions(options)
  }
}
// 创建地理坐标点
Qmap.prototype.createPoint = function (options = {}) {
  const { _is, QMap } = this
  const { lng, lat } = options
  var xpoint = null
  if (_is.BMap) {
    xpoint = new QMap.Point(lng, lat)
  } else if (_is.AMap) {
    xpoint = new QMap.LngLat(lng, lat)
  } else if (_is.GMap) {
    xpoint = new QMap.LatLng(lat, lng)
  }
  return xpoint
}

/***
 * point点的坐标系转换
 * bd09togcj02, gcj02tobd09, wgs84togcj02, gcj02towgs84
 * 内部已做判断，中国以外不做偏移转换，直接返回坐标
 * @param options
 * @return { lng, lat }
 */
Qmap.prototype.convertPoint = function (options = {}) {
  const { from, to, point } = options
  const { lng, lat } = point
  let _point = {}
  if (from === 'bd09' && to === 'gcj02') {
    // 一般是 百度 转 高德、谷歌
    _point = bd09togcj02(lng, lat)
  } else if (from === 'gcj02' && to === 'bd09') {
    // 一般是 高德、谷歌 转 百度
    _point = gcj02tobd09(lng, lat)
  } else if (from === 'wgs84' && to === 'gcj02') {
    _point = wgs84togcj02(lng, lat)
  } else if (from === 'gcj02' && to === 'wgs84') {
    _point = gcj02towgs84(lng, lat)
  }
  return _point
}

// 创建控件
Qmap.prototype.createControl = function (options = {}) {
  const { _is, map, QMap } = this
  const { type } = options
  var control = null
  // 控件类型
  var _type = {
    MapType: false, // 地图类型切换
    ToolBar: false, // 工具条，控制地图平移和缩放
    Scale: false, // 比例尺
    OverView: false, // 鹰眼
    Geolocation: false // 定位
  }
  _type[type] = true
  if (_is.BMap) {
    if (_type.MapType) {
      map.addControl(
        new QMap.MapTypeControl({
          type: window.BMAP_MAPTYPE_CONTROL_HORIZONTAL,
          mapTypes: [
            window.BMAP_NORMAL_MAP,
            window.BMAP_SATELLITE_MAP,
            window.BMAP_HYBRID_MAP
          ]
        })
      )
    } else if (_type.OverView) {
      map.addControl(new QMap.OverviewMapControl())
    } else if (_type.Scale) {
      map.addControl(new QMap.ScaleControl())
    } else if (_type.ToolBar) {
      map.addControl(new QMap.NavigationControl())
    } else if (_type.Geolocation) {
      map.addControl(new QMap.GeolocationControl())
    }
  } else if (_is.AMap) {
    const { cb } = options
    if (_type.MapType) {
      map.plugin(['AMap.MapType'], function () {
        // 地图类型切换
        control = new QMap.MapType({
          defaultType: 0 // 使用2D地图
        })
        map.addControl(control)
        if (cb) cb(control)
      })
    } else if (_type.OverView) {
      map.plugin(['AMap.OverView'], function () {
        control = new QMap.OverView()
        map.addControl(control)
        if (cb) cb(control)
      })
    } else if (_type.Scale) {
      map.plugin(['AMap.Scale'], function () {
        control = new QMap.Scale()
        map.addControl(control)
        if (cb) cb(control)
      })
    } else if (_type.ToolBar) {
      map.plugin(['AMap.ToolBar'], function () {
        control = new QMap.ToolBar()
        map.addControl(control)
        if (cb) cb(control)
      })
    } else if (_type.Geolocation) {
      // 由于Chrome、IOS10等已不再支持非安全域的浏览器定位请求，为保证定位成功率和精度，请尽快升级您的站点到HTTPS。
      map.plugin('AMap.Geolocation', function () {
        control = new QMap.Geolocation({
          enableHighAccuracy: true, // 是否使用高精度定位，默认:true
          timeout: 10000, // 超过10秒后停止定位，默认：无穷大
          maximumAge: 0, // 定位结果缓存0毫秒，默认：0
          convert: true, // 自动偏移坐标，偏移后的坐标为高德坐标，默认：true
          showButton: true, // 显示定位按钮，默认：true
          buttonPosition: 'LB', // 定位按钮停靠位置，默认：'LB'，左下角
          buttonOffset: new QMap.Pixel(10, 20), // 定位按钮与设置的停靠位置的偏移量，默认：Pixel(10, 20)
          showMarker: true, // 定位成功后在定位到的位置显示点标记，默认：true
          showCircle: true, // 定位成功后用圆圈表示定位精度范围，默认：true
          panToLocation: true, // 定位成功后将定位到的位置作为地图中心点，默认：true
          zoomToAccuracy: true // 定位成功后调整地图视野范围使定位位置及精度范围视野内可见，默认：false
        })
        map.addControl(control)
        control.getCurrentPosition()
        // QMap.event.addListener(control, 'complete', onComplete);//返回定位信息
        // QMap.event.addListener(control, 'error', onError);      //返回定位出错信息
      })
    }
  }
}
// 创建尺寸Size
Qmap.prototype.createSize = function (options = {}) {
  const { QMap } = this
  const { width, height } = options
  return new QMap.Size(width, height)
}
// 创建像素Pixel
Qmap.prototype.createPixel = function (options = {}) {
  const { _is, QMap } = this
  const { x, y } = options
  if (_is.GMap) {
    // google.maps比较特殊
    return new QMap.Point(x, y)
  } else {
    return new QMap.Pixel(x, y)
  }
}
/***
 * 创建Icon
 * @param options
 * 百度bmap: url, size, anchor, imageSize, imageOffset, infoWindowAnchor, printImageUrl
 * 高德amap: url, image, size, imageSize, imageOffset
 * 谷歌gmap: url, size, labelOrigin, origin, anchor, scaledSize
 * @returns {*}
 */
Qmap.prototype.createIcon = function (options = {}) {
  const { _is, QMap } = this
  var xIcon = null
  if (_is.BMap) {
    const {
      url,
      size,
      anchor,
      imageSize,
      imageOffset,
      infoWindowAnchor,
      printImageUrl
    } = options
    xIcon = new QMap.Icon(url, this.createSize(size), {
      anchor: anchor && this.createSize(anchor),
      imageSize: imageSize && this.createSize(imageSize),
      imageOffset: imageOffset && this.createSize(imageOffset),
      infoWindowAnchor: infoWindowAnchor && this.createSize(infoWindowAnchor),
      printImageUrl: printImageUrl || ''
    })
  } else if (_is.AMap) {
    const { url, image, size, imageSize, imageOffset } = options
    // size.x = size.width
    // size.y = size.height
    let op = {
      image: url || image || '',
      size: size && this.createSize(size),
      imageSize: imageSize && this.createSize(imageSize)
    }
    if (imageOffset) {
      op.imageOffset = imageOffset && this.createPixel(imageOffset)
    }
    xIcon = new QMap.Icon(op)
  } else if (_is.GMap) {
    var { url, size, labelOrigin, origin, anchor, scaledSize } = options
    xIcon = {
      url: url || '',
      anchor: anchor && this.createPixel(anchor),
      labelOrigin: labelOrigin && this.createPixel(labelOrigin),
      origin: origin && this.createPixel(origin),
      scaledSize: scaledSize && this.createSize(scaledSize),
      size: size && this.createSize(size)
    }
  }
  return xIcon
}
// 创建文本标注。
Qmap.prototype.createLabel = function (options = {}) {
  const { _is, QMap } = this
  var xLabel = null
  if (_is.BMap) {
    const { text, offset, position, enableMassClear } = options
    // var { width, height } = size
    var _enableMassClear = true
    if (enableMassClear !== undefined) _enableMassClear = enableMassClear
    xLabel = new QMap.Label(text, {
      offset: offset && this.createSize(offset),
      position: position && this.createPoint(position),
      enableMassClear: _enableMassClear
    })
  } else if (_is.AMap) {
    const { text, offset, position, visible } = options
    // var { x, y } = size
    if (offset !== undefined) {
      // offset兼容width、height
      if (offset.width !== undefined && offset.x === undefined) {
        offset.x = offset.width
        offset.y = offset.height
      }
    }
    var _visible = true
    if (visible !== undefined) _visible = visible
    xLabel = new QMap.Text({
      content: text,
      offset: offset && this.createPixel(offset),
      position: position && this.createPoint(position),
      visible: _visible
    })
  }
  return xLabel
}
// 创建图像标注。
Qmap.prototype.createMarker = function (options = {}) {
  const { _is, QMap } = this
  var xMarker = null
  if (_is.BMap) {
    const { point, offset, icon, title } = options
    let _option = {
      title: title || ''
    }
    if (offset) {
      _option.offset = offset && this.createSize(offset)
    }
    if (icon) {
      _option.icon = icon // icon
    }
    xMarker = new QMap.Marker(this.createPoint(point), _option)
  } else if (_is.AMap) {
    const { point, offset, icon, title } = options
    if (offset !== undefined) {
      // offset兼容width、height
      if (offset.width !== undefined && offset.x === undefined) {
        offset.x = offset.width
        offset.y = offset.height
      }
    }
    let _option = {
      position: this.createPoint(point),
      title: title || ''
    }
    if (offset) {
      _option.offset = offset && this.createPixel(offset)
    }
    if (icon) {
      _option.icon = icon // string 或是icon
    }
    xMarker = new QMap.Marker(_option)
  } else if (_is.GMap) {
    const {
      point,
      anchorPoint,
      icon,
      title,
      animation,
      draggable,
      opacity,
      visible,
      zIndex,
      map
    } = options
    let _option = {
      position: this.createPoint(point),
      title: title || '',
      animation: animation || '',
      draggable: draggable !== undefined ? draggable : false,
      opacity: opacity || null,
      visible: visible !== undefined ? visible : true,
      zIndex: zIndex || null
    }
    if (icon) {
      _option.icon = icon // string|Icon|Symbol
    }
    if (map) {
      _option.map = map
    }
    // 信息窗口尖端的偏移量
    if (anchorPoint) {
      _option.anchorPoint = this.createPixel(anchorPoint)
    }
    xMarker = new QMap.Marker(_option)
  }
  return xMarker
}

// marker设置点标记文本标签内容
Qmap.prototype.markerSetLabel = function (options = {}) {
  const { _is } = this
  var { marker, label } = options
  const { text, offset } = label
  let xLabel = null
  if (_is.BMap) {
    if (label) {
      xLabel = this.createLabel({
        text: text,
        offset: offset
      })
    }
    marker.setLabel(xLabel)
  } else if (_is.AMap) {
    if (offset !== undefined) {
      // offset兼容width、height
      if (offset.width !== undefined && offset.x === undefined) {
        offset.x = offset.width
        offset.y = offset.height
      }
    }
    marker.setLabel({
      offset: offset && this.createPixel(offset),
      content: text
    })
  } else if (_is.GMap) {
    var { className } = label
    console.log(className)
    marker.setLabel({
      text: text,
      className: className || 'google-marker-label'
    })
  }
}
// 创建折线
Qmap.prototype.createPolyline = function (options = {}) {
  const { _is, QMap } = this
  const { path, strokeColor, strokeWeight, strokeOpacity, strokeStyle } =
    options
  var mappoints =
    path &&
    path.map((item) => {
      return this.createPoint(item)
    })
  var xPolyline = null
  if (_is.BMap) {
    const { enableEditing, icons } = options
    var _enableEditing = false
    if (enableEditing !== undefined) _enableEditing = enableEditing
    xPolyline = new QMap.Polyline(mappoints, {
      strokeColor: strokeColor || '#5475d2',
      strokeWeight: strokeWeight || 8,
      strokeOpacity: strokeOpacity || 0.7,
      strokeStyle: strokeStyle || '', // 线样式，实线:solid，虚线:dashed
      enableEditing: _enableEditing,
      icons: icons && [icons] // 通过createIconSequence 创建icons
    })
  } else if (_is.AMap) {
    const { showDir, map } = options
    xPolyline = new QMap.Polyline({
      map: map || '',
      path: mappoints,
      strokeColor: strokeColor || '',
      strokeWeight: strokeWeight || '',
      strokeOpacity: strokeOpacity || 0.7,
      strokeStyle: strokeStyle || '',
      showDir: showDir || false
    })
  } else if (_is.GMap) {
    const { clickable, draggable, editable, geodesic, icons, visible, zIndex } =
      options
    xPolyline = new QMap.Polyline({
      path: mappoints,
      strokeColor: strokeColor || '#5475d2',
      strokeWeight: strokeWeight || '8',
      strokeOpacity: strokeOpacity || 0.7,
      strokeStyle: strokeStyle || '',
      clickable: clickable !== undefined ? clickable : true,
      draggable: draggable !== undefined ? draggable : false,
      editable: editable !== undefined ? editable : false,
      geodesic: geodesic !== undefined ? geodesic : false,
      visible: visible !== undefined ? visible : true,
      zIndex: zIndex || 0,
      icons: icons && [icons] // 通过createIconSequence 创建icons
    })
  }
  return xPolyline
}
// 创建可编辑折线 (高德amap)
Qmap.prototype.createPolyEditor = function (options = {}) {
  const { _is, QMap, map } = this
  var { polyline } = options
  var polylineEditor = null
  if (_is.AMap) {
    map.plugin(['AMap.PolyEditor'], function () {
      polylineEditor = new QMap.PolyEditor(map, polyline)
      polylineEditor.open()
    })
  }
  return polylineEditor
}
// 设置折线上的符号显示 (百度bmap、google地图)
Qmap.prototype.createIconSequence = function (options = {}) {
  const { _is, QMap } = this
  var IconSequence = null
  if (_is.BMap) {
    const { symbol, offset, repeat } = options
    IconSequence = new QMap.IconSequence(symbol, offset, repeat)
  } else if (_is.GMap) {
    const { symbol, fixedRotation, offset, repeat } = options
    IconSequence = {
      icon: symbol, // symbol
      offset: offset || '10%',
      repeat: repeat || '14%',
      fixedRotation: fixedRotation !== undefined ? fixedRotation : false
    }
  }
  return IconSequence
}
/***
 * 创建symbol，为折线上符号样式 (百度bmap、google地图)
 * @param options
 */
Qmap.prototype.createSymbol = function (options = {}) {
  const { _is, QMap } = this
  var Symbol = null
  if (_is.BMap) {
    const { SymboShapeType, anchor, scale, strokeColor, strokeWeight, strokeOpacity } = options
    Symbol = new QMap.Symbol(SymboShapeType, {
      anchor: anchor && this.createSize(anchor),
      scale: scale || '', // 图标缩放大小
      strokeColor: strokeColor || '', // 设置矢量图标的线填充颜色
      strokeOpacity: strokeOpacity || 1,
      strokeWeight: strokeWeight || '' // 设置线宽
    })
  } else if (_is.GMap) {
    const { SymbolPath, anchor, scale, strokeColor, strokeWeight, strokeOpacity, rotation, fillColor, fillOpacity } = options
    Symbol = {
      path: window.google.maps.SymbolPath[SymbolPath], // SymbolPath|string
      anchor: anchor && this.createPoint(anchor),
      scale: scale || 1, // 图标缩放大小
      strokeColor: strokeColor || '', // 设置矢量图标的线填充颜色
      strokeWeight: strokeWeight || 1.2, // 设置线宽
      strokeOpacity: strokeOpacity || 1,
      rotation: rotation !== undefined ? rotation : 0,
      fillOpacity: fillOpacity !== undefined ? fillOpacity : 0.8,
      fillColor: fillColor !== undefined ? fillColor : 'transparent'
    }
    // SymbolPath: BACKWARD_CLOSED_ARROW、BACKWARD_OPEN_ARROW、CIRCLE、FORWARD_CLOSED_ARROW、FORWARD_OPEN_ARROW
  }
  return Symbol
}
/***
 * 创建圆
 * @param XMap
 * @param options
 * {
 *    center: {lng: 116.404, lat: 39.915},
 *    radius: 5,
 *    fillColor: 'yellow'
 * }
 * @returns {module:zrender/shape/Circle}
 */
Qmap.prototype.createCircle = function (options = {}, cb) {
  const { _is, QMap, map } = this
  let xCircle = null
  let circleData = {}
  if (_is.BMap) {
    xCircle = new QMap.Circle(this.createPoint(options.center), options.radius, {
      fillColor: options.fillColor || '', // 圆形填充颜色
      fillOpacity: options.fillOpacity || '', // 圆形填充透明度
      strokeColor: options.strokeColor || '', // 设置矢量图标的线填充颜色
      strokeWeight: options.strokeWeight || '', // 设置线宽
      strokeOpacity: options.strokeOpacity || 1,
      strokeStyle: options.strokeStyle || 'dashed',
      enableEditing: options.enableEditing || false, // 是否启用线编辑
      enableClicking: options.enableClicking || true // 是否响应点击事件
    })
    map.addOverlay(xCircle) // 增加圆形
    xCircle.enableEditing()
    // map.centerAndZoom(this.createPoint(center), 15)
    // 监听编辑后的数据
    xCircle.addEventListener('lineupdate', function (e) {
      circleData.lat = xCircle.getCenter().lat
      circleData.lng = xCircle.getCenter().lng
      circleData.radius = xCircle.getRadius()
      cb && cb(circleData)
    })
  } else if (_is.AMap) {
    var circle = new QMap.Circle({
      center: this.createPoint(options.center),
      radius: options.radius,
      fillColor: options.fillColor || '',
      // 圆形填充颜色
      fillOpacity: options.fillOpacity || '',
      // 圆形填充透明度
      strokeColor: options.strokeColor || '',
      // 设置矢量图标的线填充颜色
      strokeWeight: options.strokeWeight || '',
      // 设置线宽
      strokeOpacity: options.strokeOpacity || 1
    })
    circle.setMap(map)// 地图上添加折线
    // map.add(xCircle);

    // 构造编辑对象，并开启编辑状态
    map.plugin(['AMap.CircleEditor'], function () {
      xCircle = new QMap.CircleEditor(map, circle)
      circleData.lat = circle.getCenter().lat
      circleData.lng = circle.getCenter().lng
      circleData.radius = circle.getRadius()
      cb && cb(circleData, circle, xCircle)
      if (options.enableEditing) {
        xCircle.open()
      }

      xCircle.on('move', function (event) {
        circleData.lat = event.target.getCenter().lat
        circleData.lng = event.target.getCenter().lng
        circleData.radius = event.target.getRadius()
        cb && cb(circleData, circle, xCircle, event)
      })
      xCircle.on('adjust', function (event) {
        circleData.lat = event.target.getCenter().lat
        circleData.lng = event.target.getCenter().lng
        circleData.radius = event.target.getRadius()
        cb && cb(circleData, circle, xCircle, event)
      })
    })
  } else if (_is.GMap) {
    drawingManager = new QMap.Circle({
      center: this.createPoint(options.center),
      radius: options.radius,
      fillColor: options.fillColor || '', // 圆形填充颜色
      fillOpacity: options.fillOpacity || '', // 圆形填充透明度
      strokeColor: options.strokeColor || '', // 设置矢量图标的线填充颜色
      strokeWeight: options.strokeWeight || '', // 设置线宽
      strokeOpacity: options.strokeOpacity || 1,
      clickable: options.clickable !== undefined ? options.clickable : true,
      draggable: options.draggable !== undefined ? options.draggable : false,
      editable: options.editable !== undefined ? options.editable : false,
      map: options.map || this.map || '',
      visible: options.visible !== undefined ? options.visible : true,
      zIndex: options.zIndex || 1

    })
    drawingManager.addListener('center_changed', function () {
      circleChanged(circleData, cb)
    })
    drawingManager.addListener('radius_changed', function () {
      circleChanged(circleData, cb)
    })
  }
  // 监听编辑后的数据
  return xCircle || drawingManager
}
// eslint-disable-next-line no-inner-declarations
function circleChanged (circleData, cb) {
  circleData.lat = drawingManager && drawingManager.getCenter().lat()
  circleData.lng = drawingManager && drawingManager.getCenter().lng()
  circleData.radius = drawingManager && drawingManager.getRadius()
  cb && cb(circleData)
}
// 创建可编辑圆 (高德amap)
Qmap.prototype.createCircleEditor = function (options = {}) {
  const { _is, QMap, map } = this
  var { circle } = options
  var CircleEditor = null
  if (_is.AMap) {
    map.plugin(['AMap.CircleEditor'], function () {
      CircleEditor = new QMap.CircleEditor(map, circle)
      CircleEditor.open()
    })
  }
  return CircleEditor
}

// 可编辑多边形围栏
Qmap.prototype.createPolygon = function (paths, options = {}, cb) {
  const { _is, QMap, map } = this
  let xPolygon = null
  let arrPois = []

  if (_is.BMap) {
    paths.forEach(element => {
      arrPois.push(new QMap.Point(element.lng, element.lat))
    })
    xPolygon = new QMap.Polygon(arrPois, options) // 创建多边形
    map.addOverlay(xPolygon)
    xPolygon.enableEditing()
    xPolygon.addEventListener('lineupdate', function (e) {
      cb && cb(e)
    })
  } else if (_is.AMap) {
    paths.forEach(function (element) {
      arrPois.push(new QMap.LngLat(element.lng, element.lat))
    })
    var polygon = new QMap.Polygon({
      path: arrPois,
      ...options
    })

    polygon.setMap(map)// 地图上添加折线
    // map.add(polygon);
    // cb && cb(polygon)
    // 构造编辑对象，并开启编辑状态
    map.plugin(['AMap.PolyEditor'], function () {
      xPolygon = new QMap.PolyEditor(map, polygon)
      cb && cb(polygon, xPolygon)
      if (options.enableEditing) {
        xPolygon.open()
      }
      xPolygon.on('addnode', function (event) {
        cb && cb(polygon, xPolygon, event)
      })
      // 监听处理双击围栏顶点（移除一个节点时触发此事件）
      xPolygon.on('removenode', function (event) {
        cb && cb(polygon, xPolygon, event)
      })
      xPolygon.on('adjust', function (event) {
        cb && cb(polygon, xPolygon, event)
      })
      xPolygon.on('end', function (event) {
        cb && cb(polygon, xPolygon, event)
      })
    })
  } else if (_is.GMap) {
    // Construct the polygon.
    drawingManager = new QMap.Polygon({
      paths,
      ...options
    })
    drawingManager.setMap(map)
    drawingManager.addListener('mouseup', function (e) {
      mouseup(e, cb)
    })
  }
  return xPolygon || drawingManager
}

function mouseup (e, cb) {
  let cbData = drawingManager && drawingManager.getPaths().getArray()
  cb && cb(cbData)
}
/***
 * 清除覆盖物
 * @param options
 * overlays[Array] 覆盖物数组 指定覆盖物则清除指定, 未指定则清除全部
 */
Qmap.prototype.clearOverlays = function (overlays) {
  const { _is, map } = this
  if (_is.BMap) {
    if (overlays) {
      // 指定覆盖物则清除指定
      while (overlays[0]) {
        map.removeOverlay(overlays.pop())
      }
    } else {
      // 未指定则清除全部
      map.clearOverlays()
    }
  } else if (_is.AMap) {
    if (overlays) {
      // 指定覆盖物则清除指定
      map.remove(overlays)
    } else {
      // 未指定则清除全部
      map.clearMap()
    }
  } else if (_is.GMap) {
    if (overlays) {
      // 指定覆盖物则清除指定
      while (overlays[0]) {
        overlays.pop().setMap(null)
      }
    } else {
      // 未指定则清除全部
      console.warn('gmap需传入overlays')
    }

    // 单独清除所有drawingManager
    // while (drawingManager.length) { drawingManager.pop().setMap(null) }
    // drawingManager.length = 0
  }
}

// 清围栏--谷歌
Qmap.prototype.clearFence = function (options = {}, cb) {
  if (shape != null) {
    shape.setMap(null)
  }
}

// 画围栏
Qmap.prototype.drawFence = function (options = {}, cb) {
  const { _is, QMap, map } = this
  const { drawingMode, drawingOptions } = options
  let circleData = {}

  if (_is.BMap) {
    getDrawingManagerJs().then((res) => {
      let drawingManagerBMap = null
      let _BMapLib = window.BMapLib
      drawingManagerBMap = new _BMapLib.DrawingManager(map, {
        circleOptions: drawingOptions, // 圆的样式
        polygonOptions: drawingOptions // 多边形样式
      })
      drawingManagerBMap.setDrawingMode(drawingMode)
      drawingManagerBMap.open()
      drawingManagerBMap.enableCalculate()
      drawingManagerBMap.addEventListener('overlaycomplete', function (e) {
        // 绘图完成事件，判断是否有计算结果，如果没有表示没有绘制
        if (e.calculate) {
          // 当前已经绘制的覆盖物
          cb(e.overlay)
        } else {
          map.removeOverlay(e.overlay)
        }
        drawingManagerBMap.close()
      })
    })
  } else if (_is.AMap) {
    // 通过插件方式引入 AMap.MouseTool 工具
    map.plugin(['AMap.MouseTool'], function () {
      // 在地图中添加MouseTool插件
      let mouseTool = new QMap.MouseTool(map)

      console.log('event---', drawingMode)
      // 用鼠标工具画多边形
      if (drawingMode === 'polygon') {
        mouseTool.polygon(drawingOptions)
      } else {
        mouseTool.circle(drawingOptions)
      }

      // 添加事件
      // mouseTool.on('draw', (event) => {
      //   // event.obj 为绘制出来的覆盖物对象
      //   cb && cb(event.obj, event)
      // })
      // 添加事件
      // QMap.event.addListener(mouseTool, 'draw', function (event) {
      //   mouseTool.close() // 解决围栏：画圆形和多边形切换后第一次不能绘制问题：画完成就close
      //   cb && cb(event.obj, event)
      // })
      mouseTool.on('draw', function (e) {
        mouseTool.close() // 解决围栏：画圆形和多边形切换后第一次不能绘制问题：画完成就close
        cb && cb(e.obj, e)
      })
    })
  } else if (_is.GMap) {
    // POLYGON：如果绘制的是二个点，回调callback，让项目调用者进行相应操作（例如：做出提示语-请绘制完成围栏）
    if (drawingManager != null) {
      drawingManager.setMap(null)
    }
    drawingManager = new QMap.drawing.DrawingManager({
      drawingMode,
      drawingControl: true,
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [drawingManager]
      },
      circleOptions: drawingOptions, // 圆的样式
      polygonOptions: drawingOptions // 多边形样式
    })

    drawingManager.setMap(map)
    // 使用者传入类型：drawingMode
    switch (drawingMode) {
      case window.google.maps.drawing.OverlayType.CIRCLE:
        drawingManager.addListener('circlecomplete', function (e) {
          shapecomplete(e, map, circleData, cb)
        }) // 添加完成事件监听
        break
      case window.google.maps.drawing.OverlayType.POLYGON:
        drawingManager.addListener('polygoncomplete', function (e) {
          shapecomplete(e, map, circleData, cb)
        })// 添加完成事件监听
        break
    }
    drawingManager.addListener('overlaycomplete', function (e) {
      overlaycomplete(e, map, circleData, cb)
    })// 添加编辑事件监听

    return drawingManager
  }
}
// eslint-disable-next-line no-inner-declarations
function shapecomplete (e, map, circleData, cb) {
  drawingManager.setDrawingMode(null)
  if (shape != null) {
    shape.setMap(null)
  }
  // 清除上一个围栏叠加层
  shape = e
  shape.setMap(map)
  if (e.type === window.google.maps.drawing.OverlayType.CIRCLE) {
    circleData.lat = e.getCenter().lat()
    circleData.lng = e.getCenter().lng()
    circleData.radius = e.getRadius()
    cb && cb(circleData)
  } else if (e.type === window.google.maps.drawing.OverlayType.POLYGON) {
    var array = e.getPath().getArray()
    cb && cb(array)
  }
}

// eslint-disable-next-line no-inner-declarations
function overlaycomplete (e, map, circleData, cb) {
  if (e.type === window.google.maps.drawing.OverlayType.CIRCLE) {
    // Switch back to non-drawing mode after drawing a shape.
    // Add an event listener that selects the newly-drawn shape when the user
    // mouses down on it.
    var newShape = e.overlay
    newShape.type = e.type
    window.google.maps.event.addListener(newShape, 'radius_changed', function () {
      circleData.lat = newShape.getCenter().lat()
      circleData.lng = newShape.getCenter().lng()
      circleData.radius = newShape.getRadius()
      cb && cb(circleData)
    })
    window.google.maps.event.addListener(newShape, 'center_changed', function () {
      circleData.lat = newShape.getCenter().lat()
      circleData.lng = newShape.getCenter().lng()
      circleData.radius = newShape.getRadius()
      cb && cb(circleData)
    })
    window.google.maps.event.addListener(newShape, 'click', function () {
      circleData.lat = newShape.getCenter().lat()
      circleData.lng = newShape.getCenter().lng()
      circleData.radius = newShape.getRadius()
      cb && cb(circleData)
    })
  } else if (e.type === window.google.maps.drawing.OverlayType.POLYGON) {
    let newShape = e.overlay
    newShape.type = e.type
    circleData = newShape.getPath().getArray()
    window.google.maps.event.addListener(newShape, 'click', function () {

    })
    window.google.maps.event.addListener(newShape.getPath(), 'insert_at', function () {
      circleData = newShape.getPath().getArray()
      cb && cb(circleData)
    })
    window.google.maps.event.addListener(newShape.getPath(), 'set_at', function () {
      circleData = newShape.getPath().getArray()
      cb && cb(circleData)
    })
    window.google.maps.event.addListener(newShape.getPath(), 'remove_at', function () {
      circleData = newShape.getPath().getArray()
      cb && cb(circleData)
    })
  }
}

/***
 * 创建点聚合 (高德直接用plugin, 百度、谷歌需引js)
 * @param options
 * 百度：bmapStyles 图标styles
 * 谷歌：gmapImagePath 图标存放文件夹
 * @returns {clusterPromise}
 */
Qmap.prototype.createMarkerClusterer = function (options = {}) {
  const { _is, QMap, map } = this
  let { gridSize, points, markers, renderClusterMarker, renderMarker } = options
  let cluster = null
  let clusterPromise = null
  if (_is.AMap) {
    // let gridSize = 60
    let { amapStyles } = options
    // let AMap = window.AMap || QMap
    // 利用styles属性修改点聚合的图标样式
    // amapStyles = [{
    //   url: 'https://a.amap.com/jsapi_demos/static/images/blue.png',
    //   size: new AMap.Size(32, 32)
    // }, {
    //   url: 'https://a.amap.com/jsapi_demos/static/images/green.png',
    //   size: new AMap.Size(32, 32)
    // }, {
    //   url: 'https://a.amap.com/jsapi_demos/static/images/orange.png',
    //   size: new AMap.Size(36, 36)
    // }, {
    //   url: 'https://a.amap.com/jsapi_demos/static/images/red.png',
    //   size: new AMap.Size(48, 48)
    // }, {
    //   url: 'https://a.amap.com/jsapi_demos/static/images/darkRed.png',
    //   size: new AMap.Size(48, 48)
    // }]

    clusterPromise = new Promise(resolve => {
      map.plugin(['AMap.MarkerCluster'], function () {
        cluster = new QMap.MarkerCluster(map, points || markers,
          {
            gridSize,
            styles: amapStyles, // 自定义图标
            renderClusterMarker, // 完全自定义：自定义聚合点样式（不传为默认）
            renderMarker // 完全自定义：自定义非聚合点样式（不传为默认）
          }
        )
        if (amapStyles) cluster.setStyles(amapStyles)

        resolve(cluster)
      })
    })
  } else if (_is.BMap) {
    let { bmapStyles } = options

    // let EXAMPLE_URL = 'http://api.map.baidu.com/library/MarkerClusterer/1.2/examples/' // 自定义图标由copy-webpack-plugin拷贝到dist的img中
    // bmapStyles = [{
    //   url: EXAMPLE_URL + 'images/heart30.png',
    //   size: new QMap.Size(30, 26),
    //   opt_anchor: [16, 0],
    //   textColor: '#ff00ff',
    //   opt_textSize: 10
    // }, {
    //   url: EXAMPLE_URL + 'images/heart40.png',
    //   size: new QMap.Size(40, 35),
    //   opt_anchor: [40, 35],
    //   textColor: '#ff0000',
    //   opt_textSize: 12
    // }, {
    //   url: EXAMPLE_URL + 'images/heart50.png',
    //   size: new QMap.Size(50, 44),
    //   opt_anchor: [32, 0],
    //   textColor: 'white',
    //   opt_textSize: 14
    // }]
    clusterPromise = new Promise(resolve => {
      getClustererJs().then(() => {
        var _BMapLib = window.BMapLib
        cluster = new _BMapLib.MarkerClusterer(map, { markers: markers })
        // 设置图标
        if (bmapStyles) cluster.setStyles(bmapStyles)

        resolve(cluster)
      })
    })
  } else if (_is.GMap) {
    const { gmapImagePath, imagePath, maxZoom, gridSize, styles, clusterClass } = options
    clusterPromise = new Promise(resolve => {
      getGoogleClustererJs().then(() => {
        let MarkerClusterer = window.MarkerClusterer
        let _opts = {
          imagePath: gmapImagePath || imagePath,
          maxZoom,
          gridSize,
          styles,
          clusterClass
        }
        let opts = attachOptions(_opts)
        if (!imagePath) {
          opts.imagePath = 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m'
        }
        cluster = new MarkerClusterer(map, markers, opts)

        resolve(cluster)
      })
    })
  }

  return clusterPromise
}
// 若参数不为空 则 加到options参数中
function attachOptions (opts) {
  let _opts = {}
  for (let key in opts) {
    if (opts[key] !== undefined && opts[key] !== null) {
      _opts[key] = opts[key]
    }
  }
  return _opts
}
// 创建信息窗
Qmap.prototype.createInfoWindow = function (options = {}) {
  const { _is, QMap } = this
  var infoWindow = ''
  if (_is.AMap) {
    // 打开信息框方法 infowindow.open(map, point: Point)
    const { isCustom, content, position, closeWhenClickMap, anchor, size, offset, showShadow } = options
    if (offset !== undefined) {
      // offset兼容width、height
      if (offset.width !== undefined && offset.x === undefined) {
        offset.x = offset.width
        offset.y = offset.height
      }
    }
    infoWindow = new QMap.InfoWindow({
      isCustom: isCustom !== undefined ? isCustom : false,
      content: content || '',
      position: position && this.createPoint(position),
      size: size && this.createSize(size),
      anchor: anchor || 'bottom-center',
      offset: offset !== undefined ? this.createPixel(offset) : '',
      closeWhenClickMap:
        closeWhenClickMap !== undefined ? closeWhenClickMap : false,
      showShadow: showShadow !== undefined ? showShadow : false
    })
  } else if (_is.BMap) {
    // 打开信息框方法 map.openInfoWindow(infoWnd: InfoWindow, point: Point)
    const { content, width, height, maxWidth, title, enableCloseOnClick, offset } = options
    infoWindow = new QMap.InfoWindow(content, {
      width: width || 0,
      height: height || 0,
      maxWidth: maxWidth || '',
      offset: offset !== undefined ? this.createSize(offset) : '',
      title: title || '',
      enableCloseOnClick:
        enableCloseOnClick !== undefined ? enableCloseOnClick : false
    })
  } else if (_is.GMap) {
    const { content, position, disableAutoPan, maxWidth, minWidth, offset, zIndex } = options
    infoWindow = new QMap.InfoWindow({
      content: content || '',
      position: position && this.createPoint(position),
      maxWidth: maxWidth || '',
      minWidth: minWidth || '',
      disableAutoPan: disableAutoPan !== undefined ? disableAutoPan : true,
      pixelOffset: offset && this.createSize(offset),
      zIndex: zIndex || 0
    })
  }
  return infoWindow
}
/***
 * 打开信息窗
 * @param options
 * bmap {infowindow, point}
 * amap {infowindow, point}
 * gmap {infowindow, point/marker}
 */
Qmap.prototype.openInfoWindow = function (options = {}) {
  const { _is } = this
  const { map } = options
  const { infowindow, point, marker } = options

  const mapobj = map || this.map
  const _point = point && this.createPoint(point)
  if (_is.AMap) {
    infowindow.open(mapobj, _point)
  } else if (_is.BMap) {
    mapobj.openInfoWindow(infowindow, _point)
  } else if (_is.GMap) {
    let _options = {
      map: mapobj
    }
    if (_point) {
      infowindow.setPosition(_point)
    }
    if (marker) {
      _options.anchor = marker
    }
    infowindow.open(_options)
  }
}
// 关闭信息框
Qmap.prototype.closeInfoWindow = function (options = {}) {
  const { _is } = this
  if (_is.AMap) {
    // amap可指定关闭
    const { infowindow } = options
    infowindow.close()
  } else if (_is.BMap) {
    // bmap 关闭全部
    const { map } = options
    map.closeInfoWindow()
  } else if (_is.GMap) {
    const { infowindow } = options
    infowindow.close()
  }
}
// 坐标转换-单点 (AMap)
// var lnglat = [116.46706996,39.99188446];
Qmap.prototype.convertFrom = function (options = {}) {
  const { _is, QMap } = this
  const { lnglat, type, cb } = options
  if (_is.AMap) {
    QMap.convertFrom(lnglat, type, function (status, result) {
      if (result.info === 'ok') {
        var resLnglat = result.locations[0]
        if (cb) cb(resLnglat)
      }
    })
  }
}
// 坐标转换-批量 (AMap)
// var path = [
//   new AMap.LngLat(116.368904,39.913423),
//   new AMap.LngLat(116.398258,39.904600)
// ];
Qmap.prototype.convertFromBatch = function (options = {}) {
  const { _is, QMap } = this
  const { path, type, cb } = options
  if (_is.AMap) {
    QMap.convertFrom(path, type, function (status, result) {
      if (result.info === 'ok') {
        var path2 = result.locations
        if (cb) cb(path2)
      }
    })
  }
}
// 路线规划 (谷歌地图)
Qmap.prototype.DirectionsServiceRoute = function (options = {}) {
  const { _is, QMap, map } = this
  const { origin, destination, waypoints, optimizeWaypoints, travelMode, cb } =
    options
  if (_is.GMap) {
    const directionsService = new QMap.DirectionsService()
    const directionsRenderer = new QMap.DirectionsRenderer()
    directionsRenderer.setMap(map)
    directionsService.route(
      {
        origin: origin,
        destination: destination,
        waypoints: waypoints || [],
        optimizeWaypoints:
          optimizeWaypoints !== undefined ? optimizeWaypoints : true,
        travelMode: travelMode || QMap.TravelMode.DRIVING
      },
      (response, status) => {
        if (status === 'OK' && response) {
          let route = response.routes[0]
          directionsRenderer.setDirections(response)
          if (cb) cb(route)
        } else {
          window.alert('Directions request failed due to ' + status)
        }
      }
    )
  }
}
/***
 * 覆盖物最佳视野
 * params:
 * 谷歌、百度传path或者points数组: 都代表普通经纬度数组；如[{lng: 40.12345, lat: 117.1234}]
 * 高德传覆盖物数组overlayList [marker, marker, polyline]
 * 百度还可传视野参数 viewport: {center, zoom}
 * @param options
 */
Qmap.prototype.setFitView = function (options = {}) {
  const { _is, QMap, map } = this
  if (_is.GMap) {
    // 传path或者points
    const { points, path } = options
    let _path = path || points
    var bounds = new QMap.LatLngBounds()
    _path.forEach((item) => {
      let point = this.createPoint(item)
      bounds.extend(point)
    })
    map.fitBounds(bounds)
  } else if (_is.AMap) {
    const { overlayList } = options
    // 传覆盖物根据覆盖物，不传覆盖物-全部
    if (overlayList) {
      map.setFitView(overlayList)
    } else {
      map.setFitView()
    }
  } else if (_is.BMap) {
    // viewport: {center, zoom}
    const { points, path, viewport } = options
    let _path = path || points
    if (_path) {
      let _points = []
      _path.forEach((item) => {
        _points.push(this.createPoint(item))
      })
      map.setViewport(_points)
    }
    if (viewport) {
      map.setViewport(viewport)
    }
  }
}
// 设置覆盖物显示隐藏
Qmap.prototype.setOverlayVisible = function (options = {}) {
  const { _is } = this
  const { overlay, visible } = options
  if (_is.BMap || _is.AMap) {
    visible ? overlay.show() : overlay.hide()
  } else if (_is.GMap) {
    visible ? overlay.setVisible(true) : overlay.setVisible(false)
  }
}
// 异步获取点聚合相关js (BMap)
function getClustererJs () {
  if (!window.BMapLib) {
    window.BMapLib = {}
    window.BMapLib.MarkerClusterer = {}
    window.BMapLib.TextIconOverlay = {}
    window.BMapLib.MarkerClusterer._preLoader = new Promise((resolve) => {
      var $scriptMarkerClusterer = document.createElement('script')
      // 此js点聚合有bug label会消失、性能差
      // $scriptMarkerClusterer.src = 'http://api.map.baidu.com/library/MarkerClusterer/1.2/src/MarkerClusterer_min.js'
      $scriptMarkerClusterer.src = './MarkerClusterer.js'
      $scriptMarkerClusterer.async = true
      document.body.appendChild($scriptMarkerClusterer)
      $scriptMarkerClusterer.onload = function () {
        var _BMapLib = window.BMapLib
        resolve(_BMapLib.MarkerClusterer)
        $scriptMarkerClusterer = null
        window.BMapLib.MarkerClusterer._preLoader = null
      }
    })
    window.BMapLib.TextIconOverlay._preLoader = new Promise((resolve) => {
      var $scriptTextIconOverlay = document.createElement('script')
      // $scriptTextIconOverlay.src =
      //   'http://api.map.baidu.com/library/TextIconOverlay/1.2/src/TextIconOverlay_min.js'
      $scriptTextIconOverlay.src = './TextIconOverlay_min.js'
      $scriptTextIconOverlay.async = true
      document.body.appendChild($scriptTextIconOverlay)
      $scriptTextIconOverlay.onload = function () {
        var _BMapLib = window.BMapLib
        resolve(_BMapLib.TextIconOverlay)
        $scriptTextIconOverlay = null
        window.BMapLib.TextIconOverlay._preLoader = null
      }
    })
    return Promise.all([
      window.BMapLib.MarkerClusterer._preLoader,
      window.BMapLib.TextIconOverlay._preLoader
    ])
  } else if (
    window.BMapLib.MarkerClusterer._preLoader === null &&
    window.BMapLib.MarkerClusterer._preLoader === null
  ) {
    var _BMapLib = window.BMapLib
    return Promise.resolve([
      _BMapLib.MarkerClusterer,
      _BMapLib.TextIconOverlay
    ])
  } else {
    return Promise.all([
      window.BMapLib.MarkerClusterer._preLoader,
      window.BMapLib.TextIconOverlay._preLoader
    ])
  }
}
// 异步获取点聚合相关js (BMap)
function getGoogleClustererJs () {
  if (!window.MarkerClusterer) {
    window.MarkerClusterer = {}
    window.MarkerClusterer._preLoader = new Promise((resolve) => {
      var $scriptMarkerClusterer = document.createElement('script')
      // 官方google js
      $scriptMarkerClusterer.src =
        'https://unpkg.com/@google/markerclustererplus@4.0.1/dist/markerclustererplus.min.js'
      // 我们阿里云的
      // $scriptMarkerClusterer.src =
      //   './markerclustererplus.min.js'
      $scriptMarkerClusterer.async = true
      document.body.appendChild($scriptMarkerClusterer)
      $scriptMarkerClusterer.onload = function () {
        var MarkerClusterer = window.MarkerClusterer
        resolve(MarkerClusterer)
        $scriptMarkerClusterer = null
        window.MarkerClusterer._preLoader = null
      }
    })
    return window.MarkerClusterer._preLoader
  } else if (window.MarkerClusterer._preLoader === null) {
    var MarkerClusterer = window.MarkerClusterer
    return Promise.resolve(MarkerClusterer)
  } else {
    return window.MarkerClusterer._preLoader
  }
}
// 画围栏 (BMap)
export function getDrawingManagerJs () {
  if (!window.DrawingManager) {
    const oldBAIDU = window.$BAIDU$
    window.DrawingManager = {}
    window.DrawingManager._preLoader = new Promise(resolve => {
      var $scriptDrawingManager = document.createElement('script')
      // DrawingManager_min百度js存在问题，改源码放在公司OSS
      $scriptDrawingManager.src = './DrawingManager.js'
      $scriptDrawingManager.async = true
      document.body.appendChild($scriptDrawingManager)
      $scriptDrawingManager.onload = function () {
        var DrawingManager = window.DrawingManager
        resolve(DrawingManager)
        $scriptDrawingManager = null
        window.DrawingManager._preLoader = null
        window.$BAIDU$ = oldBAIDU // 修复围栏和搜索的冲突
      }
    })
    return window.DrawingManager._preLoader
  } else if (window.DrawingManager._preLoader === null) {
    var DrawingManager = window.DrawingManager
    return Promise.resolve(DrawingManager)
  } else {
    return window.DrawingManager._preLoader
  }
}

// 添加覆盖物
Qmap.prototype.addOverlay = function (options = {}) {
  const { _is, map } = this
  const { overlay } = options
  if (_is.BMap) {
    map.addOverlay(overlay)
  } else if (_is.AMap) {
    map.add(overlay)
  } else if (_is.GMap) {
    overlay.setMap(map)
  }
}
/***
 * 设置中心点和缩放
 * params: { center(string, object), zoom(number) }
 * @param options
 */
Qmap.prototype.setZoomAndCenter = function (options = {}) {
  const { _is, map } = this
  const { center, zoom } = options
  if (!center) {
    return
  }
  let centerType = typeof center
  if (_is.BMap) {
    const _zoom = zoom || 4
    // center
    let _center = ''
    if (centerType === 'string') {
      _center = center
    } else if (centerType === 'object') {
      _center = this.createPoint(center)
    }
    map.centerAndZoom(_center, _zoom)
  } else if (_is.AMap) {
    const _zoom = zoom || 3
    if (centerType === 'string') {
      console.warn('amap的center不支持string')
      return
    }
    let _center = center && this.createPoint(center)
    map.setZoomAndCenter(_zoom, _center)
  } else if (_is.GMap) {
    const _zoom = zoom || 4
    if (centerType === 'string') {
      console.warn('google.maps的center不支持string')
      return
    }
    let _center = center && this.createPoint(center)
    map.setCenter(_center)
    map.setZoom(_zoom)
  }
}
Qmap.prototype.setCenter = function (center) {
  const { map } = this
  if (!center) return
  let centerType = typeof center
  let _center = ''
  if (centerType === 'string') {
    _center = center
  } else if (centerType === 'object') {
    _center = this.createPoint(center)
  }
  map.setCenter(_center)
}
Qmap.prototype.setZoom = function (zoom) {
  const { map } = this
  let _zoom = zoom || 4
  map.setZoom(_zoom)
}
/***
 * 给地图实例绑定事件
 * @param options
 * instance 实例：map, marker, polyline...
 * eventName 事件名称：click, dbclick, rightclick
 * callback 事件回调函数
 */
Qmap.prototype.addListener = function (instance, eventName, callback) {
  const { _is, map, QMap } = this
  instance = instance || map
  if (_is.BMap) {
    instance.addEventListener(eventName, callback)
  } else if (_is.AMap) {
    instance.on(eventName, callback)
  } else if (_is.GMap) {
    QMap.event.addListener(instance, eventName, callback)
  }
}

/***
 * 设置国际化语言
 * @param options
 * bmap: 不支持
 * amap: lang en zh_cn zh_en
 * gmap: lang en zh... https://developers.google.cn/maps/faq#languagesupport
 * callback 事件回调函数
 */
Qmap.prototype.setLang = function (lang, callback) {
  const { _is, map } = this
  if (_is.BMap) {
    console.warn('不支持国际化')
  } else if (_is.AMap) {
    console.log(map)
    map.setLang(lang)
  } else if (_is.GMap) {
    let googleLang = lang
    // 纠正一些lang传参
    if (lang === 'zh_cn' || lang === 'zh_CN') {
      googleLang = 'zh-CN'
    } else if (lang === 'zh_en') {
      return
    }
    // Destroy old API
    document.querySelectorAll('script[src^="https://maps.googleapis.com"]').forEach(script => {
      script.remove()
    })
    if (window.google) {
      delete window.google
    }
    // 需重新下载其他语言js
    handleMapJs(
      {
        ak: mapAk,
        type: mapType,
        lang: googleLang
      }).then((GMap) => {
      // 重载map,暂时在callback中重载，利用vue的v-if
      // GMap.event.trigger(map, 'resize')
      if (callback) callback(GMap)
    })
  }
}

/***
 * 设置插件 plugins/librarys
 * @param options
 * amap: plugins 插件列表：string/array https://lbs.amap.com/api/javascript-api/guide/abc/plugins.cn/maps/faq#languagesupport
 * callback 事件回调函数
 */
Qmap.prototype.setPlugins = function (plugins, callback) {
  const { _is, map, QMap } = this
  if (_is.AMap) {
    QMap.plugin(plugins, function () { // 异步同时加载多个插件
      if (callback) {
        let _options = {
          map: map,
          QMap: QMap
        }
        callback(_options)
      }
    })
  }
}
/***
 * 地址解析： 地址=>经纬度geocoder.getPoint 经纬度=>地址geocoder.getAddress
 * @param options
 * geocoder.getPoint { address, callback }
 * geocoder.getAddress { point, callback }
 * callback 事件回调函数
 */
/***
 * 地址=>经纬度
 * @param options
 * point
 * geocoderOptions: amap(city,radius,lang,batch,extensions)
 * @param callback 包含Point
 */
Qmap.prototype.getPointByGeocoder = function (options = {}, callback) {
  const { _is, QMap } = this
  const { address, geocoderOptions = {} } = options
  if (_is.BMap) {
    const geocoder = new QMap.Geocoder(geocoderOptions)
    if (address) {
      let _address = address
      geocoder.getPoint(_address, callback)
    }
  } else if (_is.AMap) {
    this.setPlugins('AMap.Geocoder', function ({ QMap }) {
      if (!geocoderOptions.lang) {
        geocoderOptions.lang = this.lang
      }
      var geocoder = new QMap.Geocoder(geocoderOptions)
      if (address) {
        geocoder.getLocation(address, function (status, result) {
          // if (status === 'complete' && result.info === 'OK') {
          //   // result中对应详细地理坐标信息
          // }
          if (callback) callback(status, result)
        })
      }
    })
  } else if (_is.GMap) {
    const geocoder = new QMap.Geocoder()
    let _options = {}
    if (address) {
      _options.address = address
    }
    geocoder.geocode(_options, callback)
  }
}
/***
 * 经纬度=>地址
 * @param options
 * point
 * geocoderOptions: amap(city,radius,lang,batch,extensions)
 * @param callback 包含address
 */
Qmap.prototype.getAddressByGeocoder = function (options = {}, callback) {
  const { _is, QMap } = this
  const { point, geocoderOptions = {} } = options
  if (_is.BMap) {
    const geocoder = new QMap.Geocoder()
    if (point) {
      let _point = this.createPoint(point)
      geocoder.getLocation(_point, callback)
    }
  } else if (_is.AMap) {
    this.setPlugins('AMap.Geocoder', ({ QMap }) => {
      if (!geocoderOptions.lang) {
        geocoderOptions.lang = this.lang
      }
      console.log(geocoderOptions)
      var geocoder = new QMap.Geocoder(geocoderOptions)
      if (point) {
        let lnglat = this.createPoint(point)
        geocoder.getAddress(lnglat, function (status, result) {
          // if (status === 'complete' && result.info === 'OK') {
          //   // result为对应的地理位置详细信息
          // }
          let res = { status, result }
          if (callback) callback(res)
        })
      }
    })
  } else if (_is.GMap) {
    const geocoder = new QMap.Geocoder()
    let _options = {}
    if (point) {
      _options.location = this.createPoint(point)
    }
    geocoder.geocode(_options, callback)
  }
}
// 获取二点之间距离
Qmap.prototype.getDistance = function (options = {}, callback) {
  const { _is, QMap } = this
  const { start, end } = options
  let distance = 0
  let startPoint = this.createPoint({ lng: start.lng, lat: start.lat })
  let endPoint = this.createPoint({ lng: end.lng, lat: end.lat })
  if (_is.BMap) {
    distance = this.map.getDistance(startPoint, endPoint)
  } else if (_is.AMap) {
    distance = startPoint.distance(endPoint)
  } else if (_is.GMap) {
    distance = QMap.geometry.spherical.computeDistanceBetween(startPoint, endPoint)
  }
  return distance
}
/***
 * 创建海量点SeaPoints
 * @param options
 * bmap:
 * shape: BMAP_POINT_SHAPE_CIRCLE 圆形，为默认形状、BMAP_POINT_SHAPE_STAR 星形、BMAP_POINT_SHAPE_SQUARE
 * 方形、BMAP_POINT_SHAPE_RHOMBUS 菱形、BMAP_POINT_SHAPE_WATERDROP 水滴状，该类型无size和color属性
 * size: BMAP_POINT_SIZE_TINY 定义点的尺寸为超小，宽高为2px*2px
       、BMAP_POINT_SIZE_SMALLER 定义点的尺寸为很小，宽高为4px*4px
       、BMAP_POINT_SIZE_SMALL 定义点的尺寸为小，宽高为8px*8px
       、BMAP_POINT_SIZE_NORMAL 定义点的尺寸为正常，宽高为10px*10px，为海量点默认尺寸
       、BMAP_POINT_SIZE_BIG 定义点的尺寸为大，宽高为16px*16px
       、BMAP_POINT_SIZE_BIGGER 定义点的尺寸为很大，宽高为20px*20px
       、BMAP_POINT_SIZE_HUGE 定义点的尺寸为超大，宽高为30px*30px
 *
 *
 *
 * @returns {*}
 */
Qmap.prototype.createSeaPoints = function (options = {}) {
  const { _is, QMap } = this

  let xSeaPoint = null
  if (_is.BMap) {
    const { data, shape, color, size } = options
    const geoPoints = data.map(item => {
      return this.createPoint({
        lng: item.lng,
        lat: item.lat
      })
    })
    let opts = {}
    if (shape) opts.shape = shape
    if (color) opts.color = color
    if (size) opts.size = size
    xSeaPoint = new QMap.PointCollection(geoPoints, opts)
  } else if (_is.AMap) {
    const { data, style, zIndex, zooms } = options
    let styleObject = {
      opacity: 0.8,
      zIndex: zIndex || 5,
      cursor: 'pointer',
      zooms: zooms || [3, 19] // 在指定地图缩放级别范围内展示海量点图层
    }
    if (style) styleObject.style = style

    xSeaPoint = new QMap.MassMarks([], styleObject)
    // xSeaPoint.setData(geoData)
    this.seaPointsSetData({
      seaPointsObj: xSeaPoint,
      data: data
    })
    // xSeaPoint.setMap(map)
  } else if (_is.GMap) {
    // xSeaPoint = new QMap.LatLng(lat, lng)
  }
  return xSeaPoint
}
// 海量点设置 点数组
Qmap.prototype.seaPointsSetData = function (options = {}) {
  const { _is } = this
  const { data, seaPointsObj } = options
  if (!seaPointsObj) return
  if (!data) return
  if (_is.BMap) {
    const geoData = data.map(item => {
      return this.createPoint({
        lng: item.lng,
        lat: item.lat
      })
    })
    seaPointsObj.setPoints(geoData)
  } else if (_is.AMap) {
    const geoData = data.map(item => {
      if (!item.lnglat) {
        item.lnglat = [item.lng, item.lat]
        delete item.lng
        delete item.lat
      }
      return item
    })
    seaPointsObj.setData(geoData)
  }
}

// 地图选点：点击地图任意位置获取经纬度
Qmap.prototype.getLngLatByClick = function (options = {}, callback) {
  const { _is } = this
  if (_is.BMap) {
    this.map.addEventListener('click', function (e) {
      callback && callback(e.point)
    })
  } else if (_is.AMap) {
    this.map.on('click', function (e) {
      callback && callback(e.lnglat)
    }) // 添加事件
  } else if (_is.GMap) {
    this.map.addListener('click', function (e) {
      let p = { lng: e.latLng.lng(), lat: e.latLng.lat() }
      callback && callback(p)
    })
  }
}
