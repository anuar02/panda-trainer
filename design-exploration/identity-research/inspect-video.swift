import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

// Diagnostic frame extraction, not a modified version of the generated video.
let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
print("Duration: \(CMTimeGetSeconds(asset.duration)) seconds")
for track in asset.tracks {
    print("Track: \(track.mediaType.rawValue), \(track.naturalSize), fps \(track.nominalFrameRate)")
}
for second in [0.0, 1.0, 2.5, 4.0, 4.9] {
    var actual = CMTime.zero
    let frame = try generator.copyCGImage(at: CMTime(seconds: second, preferredTimescale: 600), actualTime: &actual)
    let destination = output.appendingPathComponent("frame-\(second).png")
    let writer = CGImageDestinationCreateWithURL(destination as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(writer, frame, nil)
    guard CGImageDestinationFinalize(writer) else { fatalError("Cannot write frame") }
    print("Frame \(CMTimeGetSeconds(actual)): \(frame.width)x\(frame.height), \(destination.path)")
}
