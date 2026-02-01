Yet Another Ham Logger

This is my thought on yet another ham logger.
One of the biggest failures I find is - group logging.

* You all have to use the same app
* N3FJP is one of the most feature rich, but closed source
* Setting up UDP broadcast isn't really used, and not well from what I see
* The alternatives like DXLab, N1mm, wavelog, etc. either lack critical features or are overly complex to use - especially reliably in a group

Help refine my requirements and rough edges

* Lets use docker compose to split out areas of responsiblities and make it portable
### Project Overview
**Project Name:** Yet Another Ham Logger  
**Objective:** To create a collaborative logging application for ham radio operators that addresses the shortcomings of existing solutions.

### Key Requirements

1. **User Collaboration:**
	- **Multi-User Support:** The application must support multiple simultaneous users, identified by their callsigns.
	- **Group Activities Logging:** Facilitate logging for club/group activities such as field days, contests (POTA, SOTA), and custom events.

2. **Technical Architecture:**
	- **Docker Compose:** Utilize Docker Compose to modularize the application, allowing for easy deployment and management of different components.
	- **Separation of Responsibilities:** Clearly define and separate areas of responsibility within the application to enhance maintainability and scalability.

3. **Device Integration:**
	- **HAMLib Rig Control Support:** Implement support for HAMLib to allow remote connections to locally attached devices, enhancing usability for remote operations.

4. **Logging Features:**
	- **UDP Logging Receiver and Broadcaster:** Integrate a UDP logging receiver and broadcaster to facilitate standard logging practices without reinventing existing solutions.
	- **Logging Interface:**
	  - **Component Selection:** Determine the appropriate technology stack (e.g., Node.js) for the logging interface.
	  - **User Interface Design:** Create a compact and logical interface that is user-friendly and efficient.

5. **User Experience:**
	- **Stellar Browser Interface:** Design a browser interface that is intuitive and easy to navigate, ensuring a smooth user experience.
	- **Accessibility:** Ensure that the application is accessible to users with varying levels of technical expertise.

### Additional Considerations
- **Feature Prioritization:** Identify critical features that must be included in the initial release versus those that can be added later.
- **Community Feedback:** Engage with potential users early in the development process to gather feedback and refine requirements.
- **Documentation:** Provide comprehensive documentation for both users and developers to facilitate onboarding and contribution.

### Next Steps
- **Refine Requirements:** Gather feedback on the proposed requirements and adjust based on input from potential users or stakeholders.
- **Prototype Development:** Consider creating a prototype to validate the concept and gather further insights.
* HAMLib rigctrl support so we can remote connect and provide remote connections to locally attached devices
* UDP logging receiver and broadcaster - this seems preety standard in many apps and we should implement with that in mind, do not reinvent the wheel
* Logging interface
* We may need to reverse engineer some "server" components of n3fjp - the point is to determine what server commands and sent and received so we can become a server in its place. We should look at any other popular apps to see if accomodations for supoort can be added as well. I can obtain executables for analysis

Are there any other obvious things we should bring in or do?