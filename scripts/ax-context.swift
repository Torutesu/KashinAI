import AppKit
import ApplicationServices
import Foundation

let maxLines = 180
let maxDepth = 6
let maxChildrenPerNode = 80

struct Candidate {
  let text: String
  let score: Int
  let order: Int
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
  "AXVisibleChildren" as CFString,
  "AXChildren" as CFString,
  "AXRows" as CFString,
  "AXColumns" as CFString,
  "AXTabs" as CFString
]

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

func attributeString(_ element: AXUIElement, _ attr: CFString) -> String? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attr, &value)
  guard result == .success else { return nil }
  let text = stringValue(value)
  return (text?.isEmpty == false) ? text : nil
}

func attributeElements(_ element: AXUIElement, _ attr: CFString) -> [AXUIElement] {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, attr, &value)
  guard result == .success, let array = value as? [AXUIElement] else { return [] }
  return Array(array.prefix(maxChildrenPerNode))
}

func children(_ element: AXUIElement) -> [AXUIElement] {
  var result: [AXUIElement] = []
  for attr in childAttributes {
    result.append(contentsOf: attributeElements(element, attr))
    if result.count >= maxChildrenPerNode { break }
  }
  return Array(result.prefix(maxChildrenPerNode))
}

func role(_ element: AXUIElement) -> String {
  return attributeString(element, kAXRoleAttribute as CFString) ?? ""
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
  for attr in contentAttributes {
    let text = attributeString(element, attr)
    if let text {
      appendLine(text, score: scoreFor(text, attr: attr, role: elementRole, depth: depth))
    }
  }

  for child in children(element) {
    walk(child, depth: depth + 1)
    if candidates.count >= maxLines { break }
  }
}

guard let app = NSWorkspace.shared.frontmostApplication else {
  exit(1)
}

let appElement = AXUIElementCreateApplication(app.processIdentifier)
appendLine(app.localizedName, score: 0)

var focusedWindow: CFTypeRef?
if AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow) == .success,
   let window = focusedWindow {
  walk(window as! AXUIElement, depth: 0)
}

var focusedElement: CFTypeRef?
if AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedElement) == .success,
   let element = focusedElement {
  walk(element as! AXUIElement, depth: 0)
}

if candidates.count < 12 {
  walk(appElement, depth: 0)
}

let output = candidates
  .filter { $0.score > -20 }
  .sorted {
    if $0.score != $1.score { return $0.score > $1.score }
    return $0.order < $1.order
  }
  .prefix(maxLines)
  .map { $0.text }
  .joined(separator: "\n")

print(output)
