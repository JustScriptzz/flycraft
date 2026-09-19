package com.flycraft.hud;

import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.HudLayerRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.IdentifiedLayer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;

public class FlycraftHudClient implements ClientModInitializer {
    private static final Identifier BRAIN_LAYER = Identifier.of("flycraft-hud", "brain");

    @Override
    public void onInitializeClient() {
        BrainLink.connect();
        HudLayerRegistrationCallback.EVENT.register(
            wrapper -> wrapper.attachLayerBefore(
                IdentifiedLayer.CHAT, IdentifiedLayer.of(BRAIN_LAYER, BrainOverlay::render)));
        ClientCommandRegistrationCallback.EVENT.register(
            (dispatcher, registryAccess) -> dispatcher.register(ClientCommandManager.literal("fly")
                .then(ClientCommandManager.literal("train")
                    .then(ClientCommandManager.argument("episodes", IntegerArgumentType.integer(1))
                        .executes(c -> send("!train " + IntegerArgumentType.getInteger(c, "episodes"))))
                    .executes(c -> send("!train")))
                .then(ClientCommandManager.literal("stop").executes(c -> send("!stop")))
                .then(ClientCommandManager.literal("status").executes(c -> send("!status")))
                .then(ClientCommandManager.literal("task")
                    .then(ClientCommandManager.argument("which", StringArgumentType.word())
                        .executes(c -> send("!task " + StringArgumentType.getString(c, "which")))))
                .then(ClientCommandManager.literal("watch").executes(c -> send("!watch")))
                .then(ClientCommandManager.literal("play").executes(c -> send("!play")))
                .executes(c -> send("!help"))));
    }

    private static int send(String chat) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player != null) mc.player.networkHandler.sendChatMessage(chat);
        return 1;
    }
}
