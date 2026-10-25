# v13.2.7 implementation notes

The Document PiP window now uses a cover-as-background layout inspired by the supplied reference: cover art fills the PiP canvas, the lower gradient carries the title/artist and timeline, and the transport controls form a centered group. The former separate foreground thumbnail and ±10-second buttons are removed from the primary UI. Volume, more, lyrics, queue, open-player and close-window controls have working actions.

Online track rows now invoke OnlineWorkspace.playTrackInContext before depending on Player.getTrackById. The resolver looks in the relevant context arrays and registers normalized online tracks before populating Player's ID-based queue. This specifically covers catalogue playlist tracks after entries leave the bounded online track registry.


The final alignment pass removed the white button tile behind the central play/pause icon and lowered the metadata/progress block toward the screenshot reference. The event delegation path now also switches to online mode when an online catalogue track is selected, then resolves and registers it from playlist/collection context before queueing.
