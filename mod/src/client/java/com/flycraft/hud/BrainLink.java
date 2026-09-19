package com.flycraft.hud;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Websocket client to the Python brain (serve.py). Uses only the JDK HTTP
 * client - no extra dependencies. All state lands in a volatile struct so
 * the render thread never blocks on the network.
 */
public class BrainLink {
    public static class State {
        public volatile double lamina, medulla, lobula, kc, mbon, cx, gf, app, av;
        public volatile String action = "-";
        public volatile String task = "-";
        public volatile double eps, rpe, reward;
        public volatile int episode, logs;
        public volatile boolean live;
        public volatile String status = "connecting";
    }

    public static final State STATE = new State();
    private static final URI URL = URI.create("ws://127.0.0.1:8765");
    private static final ScheduledExecutorService SCHED =
        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "flycraft-hud");
            t.setDaemon(true);
            return t;
        });

    public static void connect() {
        try {
            HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(URL, new Listener())
                .exceptionally(t -> {
                    STATE.live = false;
                    STATE.status = "retry";
                    SCHED.schedule(BrainLink::connect, 3, TimeUnit.SECONDS);
                    return null;
                });
        } catch (Exception e) {
            STATE.status = "retry";
            SCHED.schedule(BrainLink::connect, 3, TimeUnit.SECONDS);
        }
    }

    private static double g(JsonObject o, String k) {
        try {
            return o.has(k) ? o.get(k).getAsDouble() : 0.0;
        } catch (Exception e) {
            return 0.0;
        }
    }

    private static class Listener implements WebSocket.Listener {
        private final StringBuilder buf = new StringBuilder();

        @Override
        public void onOpen(WebSocket ws) {
            ws.sendText("{\"role\":\"hud\"}", true);
            ws.request(1);
            WebSocket.Listener.super.onOpen(ws);
        }

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            buf.append(data);
            if (last) {
                String msg = buf.toString();
                buf.setLength(0);
                handle(msg);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
            STATE.live = false;
            STATE.status = "closed";
            SCHED.schedule(BrainLink::connect, 3, TimeUnit.SECONDS);
            return null;
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            STATE.live = false;
            STATE.status = "error";
            try {
                ws.abort();
            } catch (Exception ignored) {
            }
            SCHED.schedule(BrainLink::connect, 3, TimeUnit.SECONDS);
        }

        private void handle(String msg) {
            try {
                JsonObject o = JsonParser.parseString(msg).getAsJsonObject();
                if (!"brain_state".equals(o.get("type").getAsString()) || !o.has("regions")) {
                    return;
                }
                JsonObject r = o.getAsJsonObject("regions");
                State s = STATE;
                s.lamina = g(r, "lamina");
                s.medulla = g(r, "medulla");
                s.lobula = g(r, "lobula");
                s.kc = g(r, "kc");
                s.mbon = g(r, "mbon");
                s.cx = g(r, "cx");
                s.gf = g(r, "gf");
                s.app = g(r, "mbon_app");
                s.av = g(r, "mbon_av");
                s.action = o.has("action_name") ? o.get("action_name").getAsString() : "-";
                s.task = o.has("task_name") ? o.get("task_name").getAsString() : "-";
                s.eps = g(o, "eps");
                s.rpe = g(o, "rpe");
                s.reward = g(o, "reward_sum");
                s.episode = (int) g(o, "episode");
                s.logs = (int) g(o, "logs");
                s.live = true;
            } catch (Exception ignored) {
            }
        }
    }
}
