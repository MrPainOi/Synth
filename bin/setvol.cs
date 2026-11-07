using System;
using System.Runtime.InteropServices;

namespace WinVol {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(ref Guid pguidEventContext);
        int VolumeStepDown(ref Guid pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
        int OpenPropertyStore(int stgmAccess, out IntPtr properties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice deviceName);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    class Program {
        static void Main(string[] args) {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                // eRender = 0, eMultimedia = 1
                Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
                
                Guid IID_IAudioEndpointVolume = typeof(IAudioEndpointVolume).GUID;
                object epvObj = null;
                // CLSCTX_ALL = 23
                Marshal.ThrowExceptionForHR(dev.Activate(ref IID_IAudioEndpointVolume, 23, IntPtr.Zero, out epvObj));
                var vol = (IAudioEndpointVolume)epvObj;

                if (args.Length == 0 || args[0] == "get") {
                    float level = 0;
                    Marshal.ThrowExceptionForHR(vol.GetMasterVolumeLevelScalar(out level));
                    Console.WriteLine((int)Math.Round(level * 100));
                    return;
                }
                if (args[0] == "mute") {
                    bool mute = false;
                    Marshal.ThrowExceptionForHR(vol.GetMute(out mute));
                    Guid g = Guid.Empty;
                    Marshal.ThrowExceptionForHR(vol.SetMute(!mute, ref g));
                    Console.WriteLine(!mute ? "muted" : "unmuted");
                    return;
                }
                float target = float.Parse(args[0], System.Globalization.CultureInfo.InvariantCulture);
                if (target > 1.0f) target = target / 100.0f;
                if (target < 0.0f) target = 0.0f;
                if (target > 1.0f) target = 1.0f;
                Guid ctx = Guid.Empty;
                Marshal.ThrowExceptionForHR(vol.SetMasterVolumeLevelScalar(target, ref ctx));
                Console.WriteLine((int)Math.Round(target * 100));
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.ToString());
            }
        }
    }
}

