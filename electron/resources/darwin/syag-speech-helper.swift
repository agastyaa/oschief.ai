#!/usr/bin/env swift
import Foundation
import Speech
import AppKit

// Usage: syag-speech-helper <path-to-wav>
// Reads WAV file, runs macOS Speech recognition, prints transcript to stdout. Errors to stderr.

guard CommandLine.arguments.count >= 2 else {
  FileHandle.standardError.write("Usage: syag-speech-helper <wav-path>\n".data(using: .utf8)!)
  exit(1)
}

let wavPath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: wavPath)

guard FileManager.default.fileExists(atPath: wavPath) else {
  FileHandle.standardError.write("File not found: \(wavPath)\n".data(using: .utf8)!)
  exit(2)
}

let authSem = DispatchSemaphore(value: 0)
var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined

SFSpeechRecognizer.requestAuthorization { status in
  authStatus = status
  authSem.signal()
}

_ = authSem.wait(timeout: .now() + 10)

guard authStatus == .authorized else {
  let msg: String
  switch authStatus {
  case .denied:
    msg = "Speech recognition access denied. Enable in System Settings > Privacy & Security > Speech Recognition."
    if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition") {
      NSWorkspace.shared.open(url)
    }
  case .restricted: msg = "Speech recognition is restricted on this device."
  case .notDetermined: msg = "Speech recognition authorization not determined. Grant access when prompted."
  default: msg = "Speech recognition not authorized."
  }
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  exit(3)
}

guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable else {
  FileHandle.standardError.write("Speech recognizer not available for current locale.\n".data(using: .utf8)!)
  exit(4)
}

let request = SFSpeechURLRecognitionRequest(url: url)
request.requiresOnDeviceRecognition = true  // Privacy-first: no audio sent to Apple
request.shouldReportPartialResults = false

var resultText: String?
var resultError: Error?
let sem = DispatchSemaphore(value: 0)

let task = recognizer.recognitionTask(with: request) { result, error in
  if let err = error {
    resultError = err
    sem.signal()
    return
  }
  guard let r = result else {
    sem.signal()
    return
  }
  if r.isFinal {
    resultText = r.bestTranscription.formattedString
    sem.signal()
  }
}

// Timeout after 60 seconds
let timeout = DispatchTime.now() + .seconds(60)
if sem.wait(timeout: timeout) == .timedOut {
  task.cancel()
  FileHandle.standardError.write("Speech recognition timed out.\n".data(using: .utf8)!)
  exit(5)
}

if let err = resultError {
  FileHandle.standardError.write("Recognition error: \(err.localizedDescription)\n".data(using: .utf8)!)
  exit(6)
}

if let text = resultText {
  print(text)
}
exit(0)
