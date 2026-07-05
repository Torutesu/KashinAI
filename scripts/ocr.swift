import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count >= 2 else {
  FileHandle.standardError.write(Data("usage: ocr.swift <image-path>\n".utf8))
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: imageURL) else {
  FileHandle.standardError.write(Data("failed to read image\n".utf8))
  exit(3)
}

var rect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
  FileHandle.standardError.write(Data("failed to build cg image\n".utf8))
  exit(4)
}

var recognized: [String] = []
let request = VNRecognizeTextRequest { request, error in
  if let error {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    return
  }

  let observations = request.results as? [VNRecognizedTextObservation] ?? []
  recognized = observations.compactMap { observation in
    observation.topCandidates(1).first?.string
  }
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["ja-JP", "en-US", "ko-KR"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

print(recognized.joined(separator: "\n"))
