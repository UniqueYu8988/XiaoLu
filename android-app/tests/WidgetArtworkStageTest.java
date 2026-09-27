package dev.xiaolu.mobile;

public final class WidgetArtworkStageTest {
    private static void check(boolean good) { if (!good) throw new AssertionError("Widget stage mismatch"); }
    public static void main(String[] args) {
        check(WidgetArtwork.progressStage(0) == 0);
        check(WidgetArtwork.progressStage(20) == 0);
        check(WidgetArtwork.progressStage(20.1) == 1);
        check(WidgetArtwork.progressStage(40) == 2);
        check(WidgetArtwork.progressStage(80) == 3);
        check(WidgetArtwork.progressStage(99.9) == 3);
        check(WidgetArtwork.progressStage(100) == 4);
        check(WidgetArtwork.progressStage(200) == 4);
        check(WidgetArtwork.timeStage(7199) == 0);
        check(WidgetArtwork.timeStage(7200) == 1);
        check(WidgetArtwork.timeStage(14400) == 2);
        check(WidgetArtwork.timeStage(21600) == 3);
        check(WidgetArtwork.timeStage(28800) == 4);
        check(WidgetArtwork.timeStage(72000) == 4);
        check(WidgetArtwork.duration(4020).equals("1小时7分"));
        System.out.println("Widget artwork: 15 checks passed.");
    }
}
