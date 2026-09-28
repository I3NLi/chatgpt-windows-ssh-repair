using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

public static class ChatGptSshBinaryRelay {
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int handle);

    static void Pump(Stream source, Stream destination) {
        byte[] buffer = new byte[4096];
        int count;
        while ((count = source.Read(buffer, 0, buffer.Length)) > 0) {
            destination.Write(buffer, 0, count);
            destination.Flush();
        }
    }

    static void Stop(Process process) {
        try { if (!process.HasExited) process.Kill(); }
        catch (InvalidOperationException) { }
    }

    public static int Run(string executable, string arguments) {
        using (Process process = new Process()) {
            process.StartInfo = new ProcessStartInfo(executable, arguments) {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true
            };
            process.Start();
            // A raw pipe handle avoided the ConsoleStream stall in the incident.
            // This assumes redirected SSH stdin, not an interactive console.
            using (Stream input = new FileStream(
                new SafeFileHandle(GetStdHandle(-10), false), FileAccess.Read, 4096, false))
            using (Stream output = new FileStream(
                new SafeFileHandle(GetStdHandle(-11), false), FileAccess.Write, 4096, false)) {
                // Raw stdout also avoids a Console encoding preamble (BOM).
                Task upstream = Task.Run(() => {
                    try { Pump(input, process.StandardInput.BaseStream); }
                    catch (IOException) { }
                    catch (ObjectDisposedException) { }
                    finally {
                        try { process.StandardInput.Close(); }
                        catch (InvalidOperationException) { }
                        // The client disconnected. Do not leave a proxy forever.
                        if (!process.WaitForExit(5000)) Stop(process);
                    }
                });
                Task downstream = Task.Run(() => {
                    try { Pump(process.StandardOutput.BaseStream, output); }
                    catch (IOException) { Stop(process); }
                });
                process.WaitForExit();
                downstream.GetAwaiter().GetResult();
                return process.ExitCode;
            }
        }
    }
}
