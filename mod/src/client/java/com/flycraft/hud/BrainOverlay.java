package com.flycraft.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;

/** Top-left HUD panel: live firing rates per brain region + training stats. */
public class BrainOverlay {
    private static final String[] NAMES = {
        "lamina", "medulla", "lobula", "k.cells", "mbon",
        "approach", "avoid", "compass", "giantFbr"
    };

    private static final float SCALE = 0.62f;

    public static void render(DrawContext ctx, RenderTickCounter tickCounter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc == null || mc.player == null || mc.options.hudHidden) {
            return;
        }
        BrainLink.State s = BrainLink.STATE;
        double[] v = {s.lamina, s.medulla, s.lobula, s.kc, s.mbon,
                      s.app, s.av, s.cx, s.gf};
        ctx.getMatrices().push();
        int sw = mc.getWindow().getScaledWidth();
        ctx.getMatrices().translate(sw - (int) (172 * SCALE) - 6, 6, 0);
        ctx.getMatrices().scale(SCALE, SCALE, 1.0f);
        int w = 172;
        int h = 18 + v.length * 11 + 58;
        ctx.fill(-5, -5, w + 5, h, 0xA0101010);
        ctx.drawText(mc.textRenderer, "FLY BRAIN", 0, 0, 0xFFFFC861, true);
        boolean live = s.live && "live".equals(s.mode);
        boolean idle = s.live && !live;
        String tag = live ? "[LIVE]" : idle ? "[IDLE]" : "[" + s.status + "]";
        int tagColor = live ? 0xFF7CFC00 : idle ? 0xFFFFC861 : 0xFFFF5555;
        ctx.drawText(mc.textRenderer, tag, 118, 0, tagColor, true);
        int yy = 14;
        for (int i = 0; i < v.length; i++) {
            double val = Math.max(0.0, Math.min(1.0, v[i]));
            ctx.drawText(mc.textRenderer, NAMES[i], 0, yy, 0xFFBBBBBB, false);
            int bx = 64;
            ctx.fill(bx, yy + 1, bx + 98, yy + 8, 0xFF2A2A2A);
            ctx.fill(bx, yy + 1, bx + (int) (98 * val), yy + 8, 0xFF7CFC00);
            yy += 11;
        }
        yy += 4;
        ctx.drawText(mc.textRenderer, "task: " + s.task, 0, yy, 0xFFFFC861, true);
        yy += 11;
        ctx.drawText(mc.textRenderer, "act: " + s.action, 0, yy, 0xFFFFFFFF, true);
        yy += 11;
        ctx.drawText(mc.textRenderer,
            String.format("R %+6.2f  ep %d  logs %d", s.reward, s.episode, s.logs),
            0, yy, 0xFFFFFFFF, true);
        yy += 11;
        if (Math.abs(s.dopeLast) > 0.005) {
            ctx.drawText(mc.textRenderer,
                String.format("DOPA %+.2f x%.1f", s.dopeLast, s.dopeMult),
                0, yy, 0xFFFFD750, true);
            yy += 11;
        }
        ctx.drawText(mc.textRenderer,
            String.format("eps %.2f  rpe %+5.2f", s.eps, s.rpe),
            0, yy, 0xFF999999, true);
        ctx.getMatrices().pop();
    }
}
