package com.flycraft.hud;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

/** Opens the LAN for friends: firewall rule (needs admin, fails gracefully)
 *  plus join addresses in chat. Called from /fly lan (explicit user action). */
public class LanOpener {
    public static List<String> lanAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        out.add(a.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    public static boolean ensureFirewall() {
        try {
            Process p = new ProcessBuilder("netsh", "advfirewall", "firewall", "add", "rule",
                "name=FlyCraft Minecraft", "dir=in", "action=allow",
                "protocol=TCP", "localport=25565,25575").redirectErrorStream(true).start();
            if (!p.waitFor(15, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return checkRule();
            }
            return p.exitValue() == 0 || checkRule();
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean checkRule() {
        try {
            Process p = new ProcessBuilder("netsh", "advfirewall", "firewall", "show", "rule",
                "name=FlyCraft Minecraft").redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes());
            p.waitFor(15, TimeUnit.SECONDS);
            return out.contains("FlyCraft");
        } catch (Exception e) {
            return false;
        }
    }

    /** Safe from any thread: blocks in background, chats back on the client thread. */
    public static void announce() {
        MinecraftClient mc = MinecraftClient.getInstance();
        Thread t = new Thread(() -> {
            List<String> ips = lanAddresses();
            boolean open = ensureFirewall();
            mc.execute(() -> tell(mc, ips, open));
        }, "flycraft-lan");
        t.setDaemon(true);
        t.start();
    }

    private static void tell(MinecraftClient mc, List<String> ips, boolean open) {
        if (mc.player == null) return;
        if (open && !ips.isEmpty()) {
            List<String> invites = new ArrayList<>();
            for (String ip : ips) invites.add(ip + ":25565");
            mc.player.sendMessage(Text.literal("[fly] LAN open - friends join " + String.join(" or ", invites)), false);
        } else if (!ips.isEmpty()) {
            mc.player.sendMessage(Text.literal("[fly] Firewall needs admin once: run server/open_lan.ps1 as Administrator. Then friends join " + ips.get(0) + ":25565"), false);
        } else {
            mc.player.sendMessage(Text.literal("[fly] No LAN address found (offline?)"), false);
        }
    }

    public static boolean brainReachable() {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", 8765), 500);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
