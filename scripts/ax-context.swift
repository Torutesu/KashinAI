import AppKit
import ApplicationServices
import Foundation

let maxLines = 180
let maxDepth = 6
let maxChildrenPerNode = 80

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

func children(_ element: AXUIElement) -> [AXUIElement] {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
  guard result == .success, let array = value as? [AXUIElement] else { return [] }
  return Array(array.prefix(maxChildrenPerNode))
}

var lines: [String] = []
var seen = Set<String>()

func appendLine(_ text: String?) {
  guard let raw = text else { return }
  let normalized = raw.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
  guard normalized.count > 1 else { return }
  let key = normalized.lowercased()
  guard !seen.contains(key) else { return }
  seen.insert(key)
  lines.append(normalized)
}

func walk(_ element: AXUIElement, depth: Int) {
  if lines.count >= maxLines || depth > maxDepth { return }

  appendLine(attributeString(element, kAXTitleAttribute as CFString))
  appendLine(attributeString(element, kAXDescriptionAttribute as CFString))
  appendLine(attributeString(element, kAXValueAttribute as CFString))
  appendLine(attributeString(element, kAXPlaceholderValueAttribute as CFString))
  appendLine(attributeString(element, kAXHelpAttribute as CFString))

  for child in children(element) {
    walk(child, depth: depth + 1)
    if lines.count >= maxLines { break }
  }
}

guard let app = NSWorkspace.shared.frontmostApplication else {
  exit(1)
}

let appElement = AXUIElementCreateApplication(app.processIdentifier)
appendLine(app.localizedName)

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

if lines.count < 12 {
  walk(appElement, depth: 0)
}

print(lines.joined(separator: "\n"))
