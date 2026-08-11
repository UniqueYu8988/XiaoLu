import { execFile } from "node:child_process";

export const YUQUIZ_TAB_TITLE_PATTERN = /口腔执业|学习台|YuQuiz/i;

export function yuQuizTabTitleMatches(title: string): boolean {
  return YUQUIZ_TAB_TITLE_PATTERN.test(title);
}

const ACTIVATE_YUQUIZ_TAB_SCRIPT = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class XiaoluForeground {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$condition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::TabItem
)
$tabs = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  $condition
)
$tab = $tabs |
  Where-Object { $_.Current.Name -match '口腔执业|学习台|YuQuiz' } |
  Select-Object -First 1
if (-not $tab) { exit 2 }
$pattern = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
$pattern.Select()
$element = $tab
$window = $null
while ($element) {
  if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window -and
      $element.Current.NativeWindowHandle -ne 0) {
    $window = $element
    break
  }
  $element = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($element)
}
if (-not $window) { exit 3 }
$hwnd = [IntPtr]$window.Current.NativeWindowHandle
[XiaoluForeground]::ShowWindowAsync($hwnd, 9) | Out-Null
Start-Sleep -Milliseconds 80
[XiaoluForeground]::SetForegroundWindow($hwnd) | Out-Null
exit 0
`;

export function activateExistingYuQuizTab(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", ACTIVATE_YUQUIZ_TAB_SCRIPT],
      { windowsHide: true, timeout: 10_000 },
      (error) => resolve(!error),
    );
  });
}
