package com.flycraft.hud;

import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.MinecraftClient;

/**
 * Installs and launches the Python brain next to the game so the overlay
 * works out of the box: embeds flybrain.py/serve.py, ensures a Python with
 * numpy+websockets, and starts serve.py on 127.0.0.1:8765. If a brain is
 * already running (the real trainer), it is reused and nothing is launched.
 */
public class BrainInstaller {
    private static final String[] BRAIN_FILES = { "flybrain.py", "serve.py" };
    private static final String[][] PYTHONS = {
        { "python", "--version" },
        { "python3", "--version" },
        { "py", "-3", "--version" },
    };

    public static void ensureBrain() {
        Thread t = new Thread(BrainInstaller::installAndLaunch, "flycraft-brain-installer");
        t.setDaemon(true);
        t.start();
    }

    private static void installAndLaunch() {
        try {
            if (portOpen("127.0.0.1", 8765)) {
                BrainLink.STATE.status = "brain found";
                return;
            }
            Path dir = MinecraftClient.getInstance().runDirectory.toPath()
                .resolve(".flycraft").resolve("brain");
            Files.createDirectories(dir);
            for (String f : BRAIN_FILES) {
                try (InputStream in = BrainInstaller.class.getResourceAsStream("/brain/" + f)) {
                    if (in == null) {
                        BrainLink.STATE.status = "brain files missing from jar";
                        return;
                    }
                    Files.copy(in, dir.resolve(f), StandardCopyOption.REPLACE_EXISTING);
                }
            }
            String[] py = findPython();
            if (py == null) {
                BrainLink.STATE.status = "install Python 3.10+ (python.org)";
                return;
            }
            if (!hasDeps(dir, py)) {
                BrainLink.STATE.status = "installing brain deps…";
                run(dir, with(py, "-m", "pip", "install", "--quiet",
                    "--disable-pip-version-check", "numpy", "websockets"));
                if (!hasDeps(dir, py)) {
                    BrainLink.STATE.status = "pip install failed (need internet)";
                    return;
                }
            }
            BrainLink.STATE.status = "starting brain…";
            List<String> cmd = Arrays.asList(with(py, "serve.py", "--port", "8765", "--no-dashboard"));
            Process p = new ProcessBuilder(cmd).directory(dir.toFile())
                .redirectOutput(dir.resolve("brain.log").toFile())
                .redirectErrorStream(true).start();
            Runtime.getRuntime().addShutdownHook(new Thread(p::destroy));
            BrainLink.STATE.status = "connecting…";
        } catch (Exception e) {
            BrainLink.STATE.status = "brain install failed";
        }
    }

    private static boolean portOpen(String host, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String[] findPython() {
        for (String[] cmd : PYTHONS) {
            try {
                Process p = new ProcessBuilder(Arrays.asList(cmd))
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
                if (p.waitFor(10, TimeUnit.SECONDS) && p.exitValue() == 0) {
                    return Arrays.copyOf(cmd, cmd.length - 1);  // strip probe arg
                }
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private static boolean hasDeps(Path dir, String[] py) {
        return run(dir, with(py, "-c", "import numpy, websockets")) == 0;
    }

    private static int run(Path dir, String[] cmd) {
        try {
            Process p = new ProcessBuilder(Arrays.asList(cmd)).directory(dir.toFile())
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            if (!p.waitFor(5, TimeUnit.MINUTES)) {
                p.destroyForcibly();
                return -1;
            }
            return p.exitValue();
        } catch (Exception e) {
            return -1;
        }
    }

    private static String[] with(String[] base, String... extra) {
        List<String> out = new ArrayList<>(Arrays.asList(base));
        out.addAll(Arrays.asList(extra));
        return out.toArray(new String[0]);
    }
}
