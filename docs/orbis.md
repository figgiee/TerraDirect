# Orbis controls and limits

The stage opens one Reactor session for the selected model. It sends a 16:9 starting image and an opening prompt, then sends each direction into the running session. Orbis returns WebRTC video and audio. The image anchors the opening. Later frames use model history and the current prompt. The API exposes no camera pose, persistent terrain mesh, city inventory, or simulation clock. [Stable API](https://www.reactor.inc/models/visko-orbis-stable/api) · [Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api)

## Delivery and session settings

| Setting | Stable | Dynamic |
| --- | --- | --- |
| Documented native generation | 832 × 480 at 18 fps | 640 × 368 at 18 fps |
| Delivered frame | Upscales to a tier advertised by the deployment | Native or an advertised upscaled tier |
| Resolution changes | Applied at the next start | Apply during playback when the deployment advertises live switching |
| Opening on this stage | 1080p by default | 1080p by default |

The browser displays the size of the received video. The Dynamic runs here delivered 1920 × 1080 and the stage did not receive an enabled live-resolution flag. The 4K claim in the research paper refers to its reported GPU configuration. [Stable API](https://www.reactor.inc/models/visko-orbis-stable/api) · [Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api) · [Visko technical report](https://arxiv.org/abs/2607.26694)

The stage uses Reactor's `passthrough` option to send the opening and direction text verbatim, including the selected pace instruction. Prompts apply at chunk boundaries, about 1.8 seconds per chunk. The first chunk can contain zero video frames. Reactor's default account limits are five concurrent sessions and ten starts per minute. This app mints one session per token and caps each session at five minutes. The app disconnects after 35 seconds idle before generation or 75 seconds idle while the run is active. [Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api#setPrompt) · [Stable prompt guide](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide) · [Reactor rate limits](https://docs.reactor.inc/resources/rate-limits) · [Billing](https://docs.reactor.inc/resources/billing)

## Research benchmarks

Visko's 60- and 120-second pairwise Arena compared overall preference, fidelity, instruction following, and temporal stability. Orbis led overall preference and temporal stability. HappyOyster led visual fidelity and instruction following in that study. In the separate five-second image-to-video Physics-IQ test, Orbis scored 26.93 versus Helios at 26.78. The VBench-2.0 physics protocol compared Orbis's structured prompting setup with other systems' official English prompts. These evaluate observable video behavior. [Visko technical report, sections 3–5](https://arxiv.org/abs/2607.26694)

For a rehearsal, judge scene continuity and visible results separately. A directional change can arrive several chunks after a prompt acknowledgment. A requested tilt, orbit, pace, or shape change remains an instruction to the video model.

## Pass simulator state to a video model

Dynamic and Stable take one optional still per generation. `set_prompt` is their live scene-edit command. To use a new still in an existing session, send `reset`, upload the image, set the image and prompt, and start a new take. The published tracks carry video and audio from the model to the client. Visko's technical report describes initializing from a video prefix in its research system. The Reactor Orbis commands expose image and text inputs. [Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api) · [Stable API](https://www.reactor.inc/models/visko-orbis-stable/api) · [Visko technical report](https://arxiv.org/html/2607.26694v3)

For an Orbis-only rendering test with two references, capture the open and blocked channel in Three.js using the same camera. Start Dynamic from each image with the same scene prompt and compare the decoded channels. Use one session with successive takes first. Two independent sessions can overlap when the deployment has capacity. Two viewers attached to one session share its generation context. Reactor's account quota and available model capacity apply independently, and each ready session bills separately. [Sessions](https://docs.reactor.inc/concepts/sessions) · [Rate limits](https://docs.reactor.inc/resources/rate-limits) · [Billing](https://docs.reactor.inc/resources/billing)

The **Use 3D frame** control in `/setup` captures the local Three.js view as a seed. The local runoff basin is synthetic. Reproducing the approved Satellite composition in 3D needs a matching scene asset and camera. The app can update the simulation from a button and send a matching direction to Orbis when a take is live. The viewer can steer with controls or presets.

| Need | Reactor model to evaluate |
| --- | --- |
| Replace a reference during a running take or return to a saved point | Helios exposes mid-run `set_image`, `set_image_strength`, `save_snapshot`, and `rewind`. [Helios API](https://www.reactor.inc/models/helios/api) |
| Style a continuous renderer feed | SANA-Streaming accepts a video track on `camera` and emits edited video. Test publishing a fixed-resolution canvas track from Three.js. [SANA-Streaming API](https://www.reactor.inc/models/sana-streaming/api) |
| Pin both ends of a generated clip | FastH3-Omni supports first and last frame inputs with an accompanying reference image. [FastH3-Omni schema](https://docs.reactor.inc/model-api-reference/fast-h3-omni/schema) |

Google's NeuralGCM combines a physics core with learned atmospheric processes. Waymo's Genie 3 adaptation uses driving actions and scene layouts as generation inputs. NVIDIA's Cosmos streaming transfer model accepts spatial control from a simulator to generate appearance. The closest fit for a terrain viewport is a persistent scene and camera supplying visual controls to a compatible learned renderer. [NeuralGCM](https://research.google/blog/fast-accurate-climate-modeling-with-neuralgcm/) · [Waymo World Model](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation/) · [NVIDIA Cosmos](https://research.nvidia.com/labs/cosmos-lab/cosmos-simulation/)

## Inspect the terrain orbit

The orbit prompt requests one clockwise revolution in 16 seconds at 25° above the ground. The fixed aerial gorge prompt uses 25° off vertical. The two shots use different angle conventions by design.

1. Start the orbit on **Dynamic** at **1080p**. Identify the creek mouth and the visible corners of the tile in the first decoded frame.
2. Check that four different sides come into view in order, then look for the creek mouth to return to its opening position. Record any side lost at the video edge. A camera-pitch value cannot be recovered from the API.
3. Apply **Deepen gorge**. Look for a fresh bedrock band on the same gorge walls and follow the original river from inlet to outlet. Mark the change visible only if the terrain change and river continuity are both clear.

The player fits the full delivered raster into the viewport. If Orbis draws beyond the raster edges, the cropped region is absent from the delivered video.

The first watched Dynamic attempt was still on the opening side at 19 seconds and had pushed the creek out of view by 40 seconds. After a preset and a typed direction, a channel reappeared, but the original bends and outlet could not be matched. The updated opening seed fits at 72% of the preview scale and **Widen shot** is available midstream. The wider setup still needs a full live orbit check.

## Verified rehearsal observations

- Both models delivered 1920 × 1080 from the same gorge seed. Stable opened in 9.47 seconds and turned the creek into a broad blue lake. Dynamic opened in 9.77 seconds and kept more of the narrow creek and original gorge. Both acknowledged snowfall. The sampled video showed no clear new snowfall.
- In a second Dynamic session, the valley remained daylight in the 7.3-second sample and had shifted to blue moonlight by the 12.2-second sample. The creek and major rock faces stayed recognizable as the view drifted. Pause and resume succeeded in that same session.
- Earlier Dynamic starts returned HTTP 429 with a capacity message. Subsequent sessions started and closed successfully. Capacity remains deployment-dependent.
- The satellite comparison used one seed and the same `Build city` direction at 1080p. Dynamic decoded its first frame in 11.63 seconds and Stable in 7.81 seconds. Both retained a small group of houses at the 17-second sample and changed the camera framing. Dynamic also acknowledged a pace change and `Rewild city`. The sampled frames did not show clear town growth or woodland reclaiming its streets. Pace remains a creative instruction with no measured year rate.
- The separate Stable creek rehearsal sent both cues verbatim in one capped 1080p session. Its first decoded frame arrived at 8.2 seconds and replaced the narrow S-bend with a wide waterway and gravel island. Stable acknowledged **Snow squall** in 648 ms and **Break in clouds** in 946 ms. The sampled frames showed neither effect through 7.1 seconds after each cue. Reactor confirmed closure. The rehearsal's 28/45 included the independent runoff simulation, so it measures a broader demo than the Orbis-only stage.
- Stable delivered 1080p in the millennia rehearsal, with a 7.93-second first frame and 852 decoded frames across 30 chunks. All three directions were acknowledged in the same stream. The opening already contained farmland. Field boundaries and furrows became more distinct, the buildings remained a small settlement, and open fields persisted after the forest cue. The camera moved right until the river bend and glacier were out of frame. Reactor confirmed closure. The internal rehearsal score was 27/45 (real time 11, creativity 8, functionality 8). Dynamic returned HTTP 429 for capacity before sending any frames, so there is no comparison for this set of directions.
- In a follow-up Dynamic session, the 1080p stream acknowledged the exact three-roof direction in 1.59 seconds. A red-roofed building came into view away from the farmhouse cluster by the 18-second sample. Samples through 24 seconds did not show three new roofs next to the original farmhouses. The original houses and river bend remained recognizable as the camera moved. Reactor confirmed closure.
- Stable attempted the approved Satellite opening with the unchanged starting image and updated fixed-view prompt. It decoded its first 1080p frame after 9.06 seconds and reported image conditioning. The first frame replaced the distant glacier and meandering valley with a close glacier front, broad waterway, and a different field and farm layout. The rehearsal ended before the Farms direction. Reactor confirmed closure.

## Approved Satellite steering

The first live **Random event** run selected **Creek clears** and received its acknowledgement after 1.82 seconds at 1080p. The river was already blue at opening and the sampled frames through 12 seconds did not show an unambiguous clearing event. The cue was replaced with **Sediment plume**, which asks for a visible contrast against the blue water. The replacement needs a live check. Reactor confirmed closure.

The Dynamic **Meteor impact** rehearsal used the approved Satellite image at 1080p. Orbis acknowledged the cue after 1.81 seconds. The 8-second sample still showed the valley in daylight, the 9-second sample showed a bright impact flash, and the 10- and 11-second samples showed a dust plume. The glacier and river bend stayed recognizable through the event. The sampled frames establish the visible impact and plume. Reactor confirmed closure.

A two-seed Dynamic rehearsal used the **Blocked creek reference** and **Open spillway reference** views with identical opening prompts. In the decoded 1080p samples around 3.5 seconds, the blocked take retained a wider pool and a visible channel curving around the deposit. The spillway take retained a narrower flow through the bend. Both kept a recognizable aerial view with some changes to texture and framing. This demonstrates visual conditioning from two starting states across separate takes. The source frames depict the runoff rehearsal basin. Both sessions closed successfully.

Dynamic opened on recognizable landmarks with the verbatim opening prompt and delivered 1080p. The target pasture had drifted out of frame by the Farms cue, glacier retreat did not expose a clear new rock band, and the Moonlight cue changed the output into silhouettes. The app recorded all three prompt receipts, between 0.83 and 1.76 seconds. The requested landscape changes remain unverified.

In a fresh Dynamic session, the browser decoded 1080p after 10.80 seconds. The rehearsal sent **Block creek** 51 ms after detecting the first frame and observed the receipt after 311 ms. The original channel remained open at the 4-, 8-, and 12-second samples. The camera moved forward and partially cropped the lower meadow. The rehearsal did not send **Open spillway**. Reactor confirmed closure for both completed rehearsals and the interrupted capture between them.
