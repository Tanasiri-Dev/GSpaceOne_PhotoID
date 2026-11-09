Act as a Senior Software Architect and Desktop App Developer. Initialize a project named 'GSpaceOne PhotoID' for Windows and macOS. The core objective is to create a high-performance ID photo printing application utilizing CPU/GPU parallel processing for real-time image manipulation.

Implement the following core modules:

Rendering Engine Module: Build a non-destructive image processing pipeline. Implement hardware acceleration (GPU compute or multi-threaded CPU) to handle Real-time Gamma, Exposure, and Brightness adjustments.

Workspace & Floating UI Module: Develop a main centralized preview canvas. Create a Detachable/Floating Settings Window containing sliders for Brightness, Exposure, Gamma, and a Crop Tool interface. Ensure UI threads are strictly separated from heavy image processing tasks to prevent blocking.

Smart Print Layout Module: Implement an auto-layout spooler that supports standard ID sizes (1", 1.5", 2", 2.5"). The algorithm must arrange maximum possible photos on standard paper sizes, dynamically scaling the high-resolution original image based on non-destructive crop/scale matrices before sending it to the OS-level native print API.

If Rust toolchain not imstall, please install for me for support all and then compile to Windows version. 
After finished make the local git inside folder and  upload to github "https://github.com/Tanasiri-Dev/GSpaceOne_PhotoID.git"
Please also add informations of project for people khow how to use the app and structure of application, how to deploy for Windows and MacOS

Please generate the foundational boilerplate, parallel processing worker structure, and state management logic for the Floating UI.