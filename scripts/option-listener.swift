import ApplicationServices
import Foundation

final class OptionTapState {
  var optionDownAt: CFAbsoluteTime?
  var otherKeyDuringOption = false
  var lastEmitAt: CFAbsoluteTime = 0

  func emit(_ name: String) {
    let now = CFAbsoluteTimeGetCurrent()
    if now - lastEmitAt < 0.25 { return }
    lastEmitAt = now
    print(name)
    fflush(stdout)
  }
}

let state = OptionTapState()
let optionMasks: CGEventFlags = [.maskAlternate]
let spaceKeyCode: Int64 = 49

func hasOption(_ event: CGEvent) -> Bool {
  return event.flags.intersection(optionMasks).isEmpty == false
}

let callback: CGEventTapCallBack = { _, type, event, refcon in
  guard let refcon else { return Unmanaged.passUnretained(event) }
  let state = Unmanaged<OptionTapState>.fromOpaque(refcon).takeUnretainedValue()

  switch type {
  case .flagsChanged:
    if hasOption(event) {
      if state.optionDownAt == nil {
        state.optionDownAt = CFAbsoluteTimeGetCurrent()
        state.otherKeyDuringOption = false
      }
    } else if let downAt = state.optionDownAt {
      let elapsed = CFAbsoluteTimeGetCurrent() - downAt
      if elapsed < 0.7 && !state.otherKeyDuringOption {
        state.emit("optionTap")
      }
      state.optionDownAt = nil
      state.otherKeyDuringOption = false
    }

  case .keyDown:
    if hasOption(event) {
      let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
      if keyCode == spaceKeyCode {
        state.otherKeyDuringOption = true
        state.emit("optionSpace")
      } else {
        state.otherKeyDuringOption = true
      }
    }

  default:
    break
  }

  return Unmanaged.passUnretained(event)
}

let mask =
  (1 << CGEventType.flagsChanged.rawValue) |
  (1 << CGEventType.keyDown.rawValue)

guard let tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: CGEventMask(mask),
  callback: callback,
  userInfo: Unmanaged.passUnretained(state).toOpaque()
) else {
  FileHandle.standardError.write(Data("failed to create event tap\n".utf8))
  exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
