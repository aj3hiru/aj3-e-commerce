Imports System.IO

''' <summary>Opens pictures GDI+ can't (the shop saves WebP): Windows' own image decoders (WIC, through WPF) turn
''' them into PNG bytes, keeping transparency. Nothing when this Windows has no decoder for the format.</summary>
Public Module Wic
    Public Function ToPng(bytes As Byte()) As Byte()
        Try
            Using ms As New MemoryStream(bytes)
                Dim dec = System.Windows.Media.Imaging.BitmapDecoder.Create(ms, System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad)
                Dim enc As New System.Windows.Media.Imaging.PngBitmapEncoder()
                enc.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(dec.Frames(0)))
                Using outMs As New MemoryStream()
                    enc.Save(outMs)
                    Return outMs.ToArray()
                End Using
            End Using
        Catch
            Return Nothing
        End Try
    End Function
End Module
