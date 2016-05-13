## Compile amule for fedora 23


sudo dnf install git redhat-rpm-config gcc gcc-c++ make bison flex binutils-devel gettext-devel GeoIP-devel wxGTK-devel zlib-devel libpng-devel gd-devel libupnp-devel cryptopp-devel

git clone https://github.com/amule-project/amule

./autogen.sh

./configure --enable-ccache --enable-amule-daemon CFLAGS="-fPIC" CXXFLAGS="-fPIC"

make > make.txt 2>&1

./src/amuled --log-stdout


### debug command

AddLogLineNS(wxT("hi there"));

return true in bool ECLogIsEnabled()

CECTag::DebugPrint
CECPacket::DebugPrint