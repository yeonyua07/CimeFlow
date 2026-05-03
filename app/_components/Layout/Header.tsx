import { useGlobalOptionStore } from "@/lib/zustand";
import {
  Container,
  Title,
  NavInner,
  NavLink,
  NavButton,
  Icon,
  Channel,
  ChannelImg,
  ChannelName,
  ChannelVerified,
} from "./Header.styled";
import {
  faGear,
  faMoon,
  faSun,
} from "@fortawesome/free-solid-svg-icons";
import ZoomSlider from "./ZoomSlider";

export default function Header() {
  const { channel, theme, setTheme } = useGlobalOptionStore();

  return (
    <Container>
      <NavInner>
        <Title href="/">CimeFlow</Title>
        {channel.channelId !== "" && (
          <Channel href="/config/channel">
            <ChannelImg src={channel.channelImageUrl} />
            <ChannelName>{channel.channelName}</ChannelName>
            {channel.verifiedMark && <ChannelVerified src="/verified.png" />}
          </Channel>
        )}
      </NavInner>
      <NavInner>
        <ZoomSlider />
        <NavButton onClick={setTheme}>
          {theme === "dark" ? (
            <Icon icon={faSun} />
          ) : (
            <Icon icon={faMoon} />
          )}
        </NavButton>
        <NavLink href="/config">
          <Icon icon={faGear} />
        </NavLink>
      </NavInner>
    </Container>
  );
}
