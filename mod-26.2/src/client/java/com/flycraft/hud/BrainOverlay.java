package com.flycraft.hud;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

/** Top-right HUD panel for 26.2 (Mojang official mappings). */
public class BrainOverlay {
    private static final String[] NAMES = {
        "lamina", "medulla", "lobula", "k.cells", "mbon",
        "approach", "avoid", "compass", "giantFbr"
    };
    private static final float SCALE = 0.62f;

    public static void render(GuiGraphics ctx, DeltaTracker tickCounter) {
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || mc.player == null || mc.options.hideGui) {
            return;
        }
        BrainLink.State s = BrainLink.STATE;
        double[] v = {s.lamina, s.medulla, s.lobula, s.kc, s.mbon,
                      s.app, s.av, s.cx, s.gf};
        ctx.pose().pushPose();
        int sw = mc.getWindow().getScaledWidth();
        ctx.pose().translate(sw - 172 * SCALE - 6, 6, 0);
        ctx.pose().scale(SCALE, SCALE, 1.0f);
        int w = 172;
        int h = 18 + v.length * 11 + 47;
        ctx.fill(-5, -5, w + 5, h, 0xA0101010);
        ctx.drawString(mc.font, "FLY BRAIN", 0, 0, 0xFFFFC861, true);
        boolean live = s.live && "live".equals(s.mode);
        boolean idle = s.live && !live;
        String tag = live ? "[LIVE]" : idle ? "[IDLE]" : "[" + s.status + "]";
        int tagColor = live ? 0xFF7CFC00 : idle ? 0xFFFFC861 : 0xFFFF5555;
        ctx.drawString(mc.font, tag, 118, 0, tagColor, true);
        int yy = 14;
        for (int i = 0; i < v.length; i++) {
            double val = Math.max(0.0, Math.min(1.0, v[i]));
            ctx.drawString(mc.font, NAMES[i], 0, yy, 0xFFBBBBBB, false);
            int bx = 64;
            ctx.fill(bx, yy + 1, bx + 98, yy + 8, 0xFF2A2A2A);
            ctx.fill(bx, yy + 1, bx + (int) (98 * val), yy + 8, 0xFF7CFC00);
            yy += 11;
        }
        yy += 4;
        ctx.drawString(mc.font, "task: " + s.task, 0, yy, 0xFFFFC861, true);
        yy += 11;
        ctx.drawString(mc.font, "act: " + s.action, 0, yy, 0xFFFFFFFF, true);
        yy += 11;
        ctx.drawString(mc.font,
            String.format("R %+6.2f  ep %d  logs %d", s.reward, s.episode, s.logs),
            0, yy, 0xFFFFFFFF, true);
        yy += 11;
        ctx.drawString(mc.font,
            String.format("eps %.2f  rpe %+5.2f", s.eps, s.rpe),
            0, yy, 0xFF999999, true);
        ctx.pose().popPose();
    }
}
