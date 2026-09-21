cask "mockforge" do
  version "0.7.4"
  sha256 :no_check

  url "https://github.com/jvictororiz/Mock-Forge/releases/download/v#{version}/MockForge-mac-arm64.dmg"
  name "MockForge"
  desc "Visual mock server manager for MockServer"
  homepage "https://github.com/jvictororiz/Mock-Forge"

  depends_on arch: :arm64

  app "MockForge.app"

  livecheck do
    url :url
    strategy :github_latest
  end

  caveats <<~EOS
    Prefer installing from the GitHub release cask so checksums stay in sync:
      brew install --cask https://github.com/jvictororiz/Mock-Forge/releases/latest/download/mockforge.rb

    MockForge is not notarized. If macOS blocks it, right-click the app and choose Open,
    or allow it in System Settings → Privacy & Security.
  EOS
end
