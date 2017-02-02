## debug amule for fedora


sudo dnf install git redhat-rpm-config gcc gcc-c++ make bison flex binutils-devel gettext-devel GeoIP-devel wxGTK-devel zlib-devel libpng-devel gd-devel libupnp-devel cryptopp-devel

```
git clone https://github.com/amule-project/amule
cd amule
./autogen.sh
./configure --enable-ccache --enable-amule-daemon --enable-amulecmd CFLAGS="-fPIC" CXXFLAGS="-fPIC"
make > make.txt 2>&1
./src/amuled --log-stdout
```

### debug command

print a formatted log
AddLogLineNS(wxT("hi there"));

print a log
std::cout << "hello there" << std::endl;

activate the logging
return true in bool ECLogIsEnabled()

enhance the logging system by adding
CECTag::DebugPrint
    wxString s1 = CFormat(wxT("%s%s tagName:%d dataType:%d dataLen:%d = ")) % space % GetDebugNameECTagNames(m_tagName) % m_tagName % m_dataType % m_dataLen;

CECPacket::DebugPrint
    if (trueSize == 0 || size == trueSize) {
      DoECLogLine(CFormat(wxT("%s %s opCode:%d size:%d")) % (incoming ? wxT("<") : wxT(">"))
        % GetDebugNameECOpCodes(m_opCode) % m_opCode % size);
    } else {
      DoECLogLine(CFormat(wxT("%s %s %d (compressed: %d)")) % (incoming ? wxT("<") : wxT(">"))
        % GetDebugNameECOpCodes(m_opCode) % size % trueSize);
    }
