import AppKit
import ApplicationServices
import Foundation

let maxLines = 180
let maxDepth = 6
let maxChildrenPerNode = 80

let noisyFrontmostAppNames = Set([
  "loginwindow",
  "usernotificationcenter",
  "notificationcenter",
  "controlcenter",
  "window server",
  "windowserver",
  "dock"
])

struct Candidate {
  let text: String
  let score: Int
  let order: Int
}

struct FocusNodeDebug: Encodable {
  let role: String?
  let title: String?
  let value: String?
  let visibleText: String?
  let selectedRangeText: String?
  let selectedMarkerText: String?
  let description: String?
  let help: String?
  let placeholder: String?
  let selectedText: String?
  let document: String?
  let url: String?
  let childCount: Int
  let attributeNames: [String]
  let selectedTextRange: String?
  let visibleCharacterRange: String?
}

struct Snapshot: Encodable {
  let appName: String?
  let workspaceAppName: String?
  let topWindowOwnerName: String?
  let windowTitle: String?
  let topWindowTitle: String?
  let focusedRole: String?
  let selectedText: String?
  let selectedRangeText: String?
  let valueText: String?
  let document: String?
  let url: String?
  let title: String?
  let focusChain: [FocusNodeDebug]
  let lines: [String]
}

let contentAttributes: [CFString] = [
  "AXSelectedText" as CFString,
  "AXValue" as CFString,
  "AXDocument" as CFString,
  "AXURL" as CFString,
  "AXDescription" as CFString,
  "AXTitle" as CFString,
  "AXHelp" as CFString,
  "AXPlaceholderValue" as CFString
]

let childAttributes: [CFString] = [
  "AXContents" as CFString,
  "AXVisibleChildren" as CFString,
  "AXChildren" as CFString,
  "AXGroup" as CFString,
  "AXGroups" as CFString,
  "AXSplitGroup" as CFString,
  "AXSplitters" as CFString,
  "AXScrollArea" as CFString,
  "AXScrollAreas" as CFString,
  "AXList" as CFString,
  "AXLists" as CFString,
  "AXOutline" as CFString,
  "AXOutlines" as CFString,
  "AXRows" as CFString,
  "AXStaticText" as CFString,
  "AXStaticTexts" as CFString,
  "AXTextArea" as CFString,
  "AXTextAreas" as CFString,
  "AXWebArea" as CFString,
  "AXWebAreas" as CFString,
  "AXRows" as CFString,
  "AXColumns" as CFString,
  "AXTabs" as CFString,
  "AXSheets" as CFString
]

func normalizedAppName(_ value: String?) -> String? {
  guard let value else { return nil }
  let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
  return normalized.isEmpty ? nil : normalized
}

func isNoisyFrontmostAppName(_ value: String?) -> Bool {
  guard let normalized = normalizedAppName(value)?.lowercased() else { return false }
  return noisyFrontmostAppNames.contains(normalized)
}

func topVisibleWindowInfo() -> (ownerName: String?, windowTitle: String?) {
  guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    as? [[String: Any]]
  else {
    return (nil, nil)
  }

  for window in windowList {
    let layer = window[kCGWindowLayer as String] as? Int ?? 0
    let alpha = window[kCGWindowAlpha as String] as? Double ?? 1
    let ownerName = normalizedAppName(window[kCGWindowOwnerName as String] as? String)
    let windowTitle = normalizedAppName(window[kCGWindowName as String] as? String)
    let bounds = window[kCGWindowBounds as String] as? [String: Any]
    let width = bounds?["Width"] as? Double ?? 0
    let height = bounds?["Height"] as? Double ?? 0

    if layer != 0 { continue }
    if alpha <= 0 { continue }
    if width < 60 || height < 60 { continue }
    if ownerName == nil { continue }
    if isNoisyFrontmostAppName(ownerName) { continue }
    if ownerName == "Window Server" { continue }

    return (ownerName, windowTitle)
  }

  return (nil, nil)
}

func stringValue(_ value: CFTypeRef?) -> String? {
  guard let value else { return nil }
  if CFGetTypeID(value) == CFStringGetTypeID() {
    return (value as! String).trimmingCharacters(in: .whitespacesAndNewlines)
  }
  if CFGetTypeID(value) == CFAttributedStringGetTypeID() {
    return ((value as! NSAttributedString).string).trimmingCharacters(in: .whitespacesAndNewlines)
  }
  if CFGetTypeID(value) == CFArrayGetTypeID() {
    let array = value as! [Any]
    let joined = array.compactMap { item -> String? in
      if CFGetTypeID(item as CFTypeRef) == CFStringGetTypeID() {
        return item as? String
      }
      return nil
    }.joined(separator: " ")
    return joined.trimmingCharacters(in: .whitespacesAndNewlines)
  }
  return nil
}

func rangeValueString(_ value: CFTypeRef?) -> String? {
  guard let value else { return nil }
  let axValue = value as! AXValue
  if AXValueGetType(axValue) == .cfRange {
    var range = CFRange()
    if AXValueGetValue(axValue, .cfRange, &range) {
      return "{location:\(range.location), length:\(range.length)}"
    }
  }
  return nil
}

func attributeString(_ element: AXUIElement, _ attr: CFString) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attr, &value)
  guard result == .success else { return nil }
  let text = stringValue(value)
  return (text?.isEmpty == false) ? text : nil
}

func attributeRangeString(_ element: AXUIElement, _ attr: CFString) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attr, &value)
  guard result == .success else { return nil }
  return rangeValueString(value)
}

func parameterizedString(_ element: AXUIElement, attribute: CFString, parameter: CFTypeRef) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyParameterizedAttributeValue(element, attribute, parameter, &value)
  guard result == .success else { return nil }
  return stringValue(value)
}

func visibleTextString(_ element: AXUIElement) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, "AXVisibleCharacterRange" as CFString, &value)
  guard result == .success, let value else { return nil }
  let axValue = value as! AXValue
  guard AXValueGetType(axValue) == .cfRange else { return nil }
  var range = CFRange()
  guard AXValueGetValue(axValue, .cfRange, &range) else { return nil }
  guard range.length > 0 else { return nil }
  guard let param = AXValueCreate(.cfRange, &range) else { return nil }
  return parameterizedString(element, attribute: "AXStringForRange" as CFString, parameter: param)
    ?? parameterizedString(element, attribute: "AXAttributedStringForRange" as CFString, parameter: param)
}

func selectedRangeTextString(_ element: AXUIElement) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, "AXSelectedTextRange" as CFString, &value)
  guard result == .success, let value else { return nil }
  let axValue = value as! AXValue
  guard AXValueGetType(axValue) == .cfRange else { return nil }
  var range = CFRange()
  guard AXValueGetValue(axValue, .cfRange, &range) else { return nil }
  guard range.length > 0 else { return nil }
  guard let param = AXValueCreate(.cfRange, &range) else { return nil }
  return parameterizedString(element, attribute: "AXStringForRange" as CFString, parameter: param)
    ?? parameterizedString(element, attribute: "AXAttributedStringForRange" as CFString, parameter: param)
}

func selectedMarkerTextString(_ element: AXUIElement) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, "AXSelectedTextMarkerRange" as CFString, &value)
  guard result == .success, let value else { return nil }
  return parameterizedString(element, attribute: "AXStringForTextMarkerRange" as CFString, parameter: value)
    ?? parameterizedString(element, attribute: "AXAttributedStringForTextMarkerRange" as CFString, parameter: value)
}

func attributeElements(_ element: AXUIElement, _ attr: CFString) -> [AXUIElement] {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attr, &value)
  guard result == .success else { return [] }
  if let rawValue = value, CFGetTypeID(rawValue) == AXUIElementGetTypeID() {
    return [rawValue as! AXUIElement]
  }
  guard let array = value as? [AXUIElement] else { return [] }
  return Array(array.prefix(maxChildrenPerNode))
}

func children(_ element: AXUIElement) -> [AXUIElement] {
  var result: [AXUIElement] = []
  var seen = Set<CFHashCode>()
  for attr in childAttributes {
    for child in attributeElements(element, attr) {
      let key = CFHash(child)
      if seen.contains(key) { continue }
      seen.insert(key)
      result.append(child)
      if result.count >= maxChildrenPerNode { break }
    }
    if result.count >= maxChildrenPerNode { break }
  }
  return Array(result.prefix(maxChildrenPerNode))
}

func role(_ element: AXUIElement) -> String {
  return attributeString(element, kAXRoleAttribute as CFString) ?? ""
}

func shouldSkipSubtree(role: String) -> Bool {
  return role.contains("MenuBar")
    || role.contains("MenuItem")
    || role.contains("Menu")
    || role.contains("Dock")
    || role.contains("Application")
}

func parent(_ element: AXUIElement) -> AXUIElement? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &value)
  guard result == .success, let parent = value else { return nil }
  return (parent as! AXUIElement)
}

func attributeNames(_ element: AXUIElement) -> [String] {
  var names: CFArray?
  let result = AXUIElementCopyAttributeNames(element, &names)
  guard result == .success, let names else { return [] }
  return (names as [AnyObject])
    .compactMap { $0 as? String }
    .sorted()
}

func ancestors(_ element: AXUIElement, limit: Int = 6) -> [AXUIElement] {
  var result: [AXUIElement] = [element]
  var current: AXUIElement? = element
  var remaining = limit
  while remaining > 0, let node = current, let next = parent(node) {
    result.append(next)
    current = next
    remaining -= 1
  }
  return result
}

func scoreFor(_ text: String, attr: CFString, role: String, depth: Int) -> Int {
  var score = max(0, 16 - depth)
  let length = text.count
  if length >= 40 { score += 14 }
  if length >= 120 { score += 10 }
  if text.range(of: #"[。！？!?]|https?://|\.com|\.ai|\.ts|\.tsx|\.swift|error|exception|failed"#, options: [.regularExpression, .caseInsensitive]) != nil {
    score += 8
  }
  let attrName = attr as String
  if attrName == "AXSelectedText" || attrName == "AXValue" || attrName == "AXDocument" { score += 10 }
  if attrName == "AXTitle" && length < 30 { score -= 8 }
  if role.contains("Button") || role.contains("Menu") || role.contains("Toolbar") { score -= 16 }
  if text.range(of: #"(をFinderに表示|About |Preferences|Services|Hide Others|Show All|Quit |Reload|Force Reload|Zoom In|Zoom Out|Toggle Full Screen|App Store|最近使った項目|システム設定|このMacについて)"#, options: [.regularExpression, .caseInsensitive]) != nil {
    score -= 48
  }
  if text.range(of: #"(⌘|⇧|⌥|⌃|command|shortcut|sidebar|workspace|show or hide|focus back|focus forward)"#, options: [.regularExpression, .caseInsensitive]) != nil {
    score -= 40
  }
  return score
}

var candidates: [Candidate] = []
var seen = Set<String>()
var order = 0

func appendLine(_ text: String?, score: Int) {
  guard let raw = text else { return }
  let normalized = raw.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
  guard normalized.count > 1 else { return }
  let key = normalized.lowercased()
  guard !seen.contains(key) else { return }
  seen.insert(key)
  candidates.append(Candidate(text: normalized, score: score, order: order))
  order += 1
}

func walk(_ element: AXUIElement, depth: Int) {
  if candidates.count >= maxLines || depth > maxDepth { return }

  let elementRole = role(element)
  if shouldSkipSubtree(role: elementRole) { return }
  for attr in contentAttributes {
    let text = attributeString(element, attr)
    if let text {
      appendLine(text, score: scoreFor(text, attr: attr, role: elementRole, depth: depth))
    }
  }

  if let visibleText = visibleTextString(element) {
    appendLine(visibleText, score: scoreFor(visibleText, attr: "AXVisibleCharacterRange" as CFString, role: elementRole, depth: depth) + 12)
  }

  if let selectedMarkerText = selectedMarkerTextString(element) {
    appendLine(selectedMarkerText, score: scoreFor(selectedMarkerText, attr: "AXSelectedTextMarkerRange" as CFString, role: elementRole, depth: depth) + 14)
  }

  for child in children(element) {
    walk(child, depth: depth + 1)
    if candidates.count >= maxLines { break }
  }
}

func walkAncestors(_ chain: [AXUIElement]) {
  for (index, node) in chain.enumerated() {
    walk(node, depth: min(index, maxDepth))
    if candidates.count >= maxLines { break }
  }
}

func debugNode(_ element: AXUIElement) -> FocusNodeDebug {
  return FocusNodeDebug(
    role: attributeString(element, kAXRoleAttribute as CFString),
    title: attributeString(element, "AXTitle" as CFString),
    value: attributeString(element, "AXValue" as CFString),
    visibleText: visibleTextString(element),
    selectedRangeText: selectedRangeTextString(element),
    selectedMarkerText: selectedMarkerTextString(element),
    description: attributeString(element, "AXDescription" as CFString),
    help: attributeString(element, "AXHelp" as CFString),
    placeholder: attributeString(element, "AXPlaceholderValue" as CFString),
    selectedText: attributeString(element, "AXSelectedText" as CFString),
    document: attributeString(element, "AXDocument" as CFString),
    url: attributeString(element, "AXURL" as CFString),
    childCount: children(element).count,
    attributeNames: Array(attributeNames(element).prefix(40)),
    selectedTextRange: attributeRangeString(element, "AXSelectedTextRange" as CFString),
    visibleCharacterRange: attributeRangeString(element, "AXVisibleCharacterRange" as CFString)
  )
}

guard let app = NSWorkspace.shared.frontmostApplication else {
  exit(1)
}

let workspaceAppName = normalizedAppName(app.localizedName)
let topWindowInfo = topVisibleWindowInfo()
let resolvedAppName = isNoisyFrontmostAppName(workspaceAppName)
  ? (topWindowInfo.ownerName ?? workspaceAppName)
  : workspaceAppName

let appElement = AXUIElementCreateApplication(app.processIdentifier)
appendLine(app.localizedName, score: 0)

var focusedWindow: CFTypeRef?
var windowElement: AXUIElement?
if AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow) == .success,
   let window = focusedWindow {
  windowElement = (window as! AXUIElement)
  walk(window as! AXUIElement, depth: 0)
}

var focusedElement: CFTypeRef?
var focusNode: AXUIElement?
if AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedElement) == .success,
   let element = focusedElement {
  focusNode = (element as! AXUIElement)
  walk(element as! AXUIElement, depth: 0)
}

let focusChain = focusNode.map { ancestors($0) } ?? []
if candidates.count < 24 && !focusChain.isEmpty {
  walkAncestors(focusChain)
}

if candidates.count < 4 && windowElement == nil && focusNode == nil {
  walk(appElement, depth: 0)
}

let focusRole = focusChain.first.map { role($0) }
let selectedText = focusChain.compactMap {
  attributeString($0, "AXSelectedText" as CFString) ?? selectedRangeTextString($0) ?? selectedMarkerTextString($0)
}.first
let selectedRangeText = focusChain.compactMap {
  selectedRangeTextString($0)
}.first
let valueText = focusChain.compactMap {
  attributeString($0, "AXValue" as CFString) ?? visibleTextString($0)
}.first
let document = focusChain.compactMap { attributeString($0, "AXDocument" as CFString) }.first
let url = focusChain.compactMap { attributeString($0, "AXURL" as CFString) }.first
let title = focusChain.compactMap { attributeString($0, "AXTitle" as CFString) }.first
  ?? windowElement.flatMap { attributeString($0, kAXTitleAttribute as CFString) }
let windowTitle = windowElement.flatMap { attributeString($0, kAXTitleAttribute as CFString) }

let lines = candidates
  .filter { $0.score > -20 }
  .sorted {
    if $0.score != $1.score { return $0.score > $1.score }
    return $0.order < $1.order
  }
  .prefix(maxLines)
  .map { $0.text }

let focusChainDebug = focusChain.prefix(8).map { debugNode($0) }

let snapshot = Snapshot(
  appName: resolvedAppName,
  workspaceAppName: workspaceAppName,
  topWindowOwnerName: topWindowInfo.ownerName,
  windowTitle: windowTitle ?? topWindowInfo.windowTitle,
  topWindowTitle: topWindowInfo.windowTitle,
  focusedRole: focusRole,
  selectedText: selectedText,
  selectedRangeText: selectedRangeText,
  valueText: valueText,
  document: document,
  url: url,
  title: title,
  focusChain: focusChainDebug,
  lines: lines
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]
if let data = try? encoder.encode(snapshot), let text = String(data: data, encoding: .utf8) {
  print(text)
} else {
  print(lines.joined(separator: "\n"))
}
