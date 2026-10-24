/* HomeforU 360° tour embed */
(function () {
  'use strict'
  var data = document.getElementById('tour-config')
  var container = document.getElementById('tour')
  if (!data || !container || !window.pannellum) {
    return
  }
  var config
  try {
    config = JSON.parse(data.textContent || '{}')
  } catch (e) {
    return
  }
  // configuration strings are always rendered as text
  config.escapeHTML = true

  /*
   * Messages with the host page. The HomeforU app frames this page (an iframe on the web, a WebView on a phone) and draws its own room switcher
   * and info card: it can ask for a room, and it hears which room is showing and which point of interest was tapped. A message is an object
   * (or its JSON text) { type: 'hfu-tour', ... }.
   *   host -> page   { action: 'loadScene', sceneId }   go to a room of this tour (an id that is not one of its rooms is ignored)
   *                  { action: 'hello' }                answer with the room that is showing (a host that loaded late)
   *   page -> host   { event: 'scene', sceneId }       the room changed (the host's chip, or the viewer's own arrow); its panorama is loading
   *                  { event: 'loaded', sceneId }      the panorama of that room is on screen
   *                  { event: 'view', yaw, pitch }     the direction in degrees, at most ten times a second, only while it changes
   *                  { event: 'marker', sceneId, markerId }   a point of interest was tapped (the host shows its title and description)
   *                  { event: 'error' }                a panorama could not be shown
   * Only room ids, marker ids and angles leave the page (public data); nothing the host sends is interpreted as markup. A page that is neither
   * framed nor inside the app does nothing here, and its configuration is left exactly as it was.
   */
  var inFrame = !!window.parent && window.parent !== window
  var inApp = !!window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function'
  var hosted = inFrame || inApp
  var TYPE = 'hfu-tour'
  var scenes = config.scenes || {}
  var viewer

  function send(payload) {
    payload.type = TYPE
    try {
      if (inFrame) {
        window.parent.postMessage(payload, '*')
      }
      if (inApp) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload))
      }
    } catch (e) {
      // a host that cannot hear is no error of the viewer
    }
  }

  if (hosted) {
    // the host draws the card of a point of interest itself: a tap on one is reported, and the viewer's own tooltip is dropped
    Object.keys(scenes).forEach(function (sceneId) {
      var spots = scenes[sceneId] && scenes[sceneId].hotSpots
      if (!spots || typeof spots.forEach !== 'function') {
        return
      }
      spots.forEach(function (spot) {
        if (spot && spot.type === 'info') {
          spot.clickHandlerArgs = { sceneId: sceneId, markerId: spot.id }
          spot.clickHandlerFunc = function (event, args) {
            send({ event: 'marker', sceneId: args.sceneId, markerId: args.markerId })
          }
          spot.text = ''
        }
      })
    })
  }

  viewer = window.pannellum.viewer(container, config)
  if (!hosted || !viewer || typeof viewer.loadScene !== 'function' || typeof window.addEventListener !== 'function') {
    return
  }

  function current() {
    return typeof viewer.getScene === 'function' ? viewer.getScene() : undefined
  }
  function read(raw) {
    var message = raw
    if (typeof message === 'string') {
      try {
        message = JSON.parse(message)
      } catch (e) {
        return null
      }
    }
    return message && typeof message === 'object' && message.type === TYPE ? message : null
  }

  window.addEventListener('message', function (event) {
    // a framed page listens to its parent only; as the top window (a WebView) the only sender is the app around it
    if (inFrame && event.source !== window.parent) {
      return
    }
    var message = read(event.data)
    if (!message) {
      return
    }
    if (message.action === 'loadScene') {
      var id = message.sceneId
      if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(scenes, id) && id !== current()) {
        viewer.loadScene(id)
      }
    } else if (message.action === 'hello') {
      send({ event: 'loaded', sceneId: current() })
    }
  })

  var lastAt = 0
  var lastYaw
  var lastPitch
  var watching = false
  function tenth(value) {
    return Math.round(value * 10) / 10
  }
  function watch() {
    if (watching || typeof window.requestAnimationFrame !== 'function' || typeof viewer.getYaw !== 'function') {
      return
    }
    watching = true
    var tick = function (now) {
      if (now - lastAt >= 100) {
        var yaw = tenth(viewer.getYaw())
        var pitch = tenth(viewer.getPitch())
        if (yaw !== lastYaw || pitch !== lastPitch) {
          lastYaw = yaw
          lastPitch = pitch
          lastAt = now
          send({ event: 'view', yaw: yaw, pitch: pitch })
        }
      }
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  }

  if (typeof viewer.on === 'function') {
    viewer.on('scenechange', function (sceneId) {
      send({ event: 'scene', sceneId: sceneId })
    })
    viewer.on('load', function () {
      send({ event: 'loaded', sceneId: current() })
      watch()
    })
    viewer.on('error', function () {
      send({ event: 'error' })
    })
  }
})()
