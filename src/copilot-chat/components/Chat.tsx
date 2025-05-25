import React, { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import NoHistory from "./sections/NoHistory";
import Header from "./sections/Header";
import Input from "./sections/Input";
import MessageList from "./sections/MessageList";
import { MessageProps } from "./atoms/Message";
import { copilotIcon } from "../../assets/copilot";
import { userIcon } from "../../assets/user";
import { useCopilotStore } from "../store/store";
import { usePlugin } from "../hooks/usePlugin";

const Chat: React.FC = () => {
	const plugin = usePlugin();
	const {
		messages,
		isLoading,
		conversations,
		activeConversationId,
		initConversationService,
	} = useCopilotStore();

	const [mode, setMode] = useState<"chat" | "edit">("chat");

	useEffect(() => {
		if (plugin) {
			initConversationService(plugin);
		}
	}, [plugin, initConversationService]);

	const displayMessages = activeConversationId
		? conversations.find((conv) => conv.id === activeConversationId)
				?.messages || []
		: messages;

	const formattedMessages: MessageProps[] = displayMessages.map(
		(message) => ({
			icon: message.role === "assistant" ? copilotIcon : userIcon,
			name: message.role === "assistant" ? "GitHub Copilot" : "User",
			message: message.content,
			linkedNotes: message.linkedNotes,
		}),
	);

	return (
		<MainLayout>
			<Header mode={mode} setMode={setMode} />
			{formattedMessages.length === 0 ? (
				<NoHistory />
			) : (
				<MessageList messages={formattedMessages} />
			)}
			<Input isLoading={isLoading} mode={mode} />
		</MainLayout>
	);
};

export default Chat;
