"""Remove explicitly marked reasoning even when markers cross streaming chunks."""
import re


class PublicText:
    def __init__(self):
        self.buffer = ""
        self.hidden = None

    def feed(self, text: str, final=False) -> str:
        self.buffer += text
        output = ""
        while self.buffer:
            if self.hidden:
                closing = f"</{self.hidden}>"
                position = self.buffer.lower().find(closing)
                if position < 0:
                    self.buffer = "" if final else self.buffer[-len(closing) + 1:]
                    break
                self.buffer = self.buffer[position + len(closing):]
                self.hidden = None
            else:
                match = re.search(r"<(think|analysis)>", self.buffer, re.I)
                if match:
                    output += self.buffer[:match.start()]
                    self.hidden = match.group(1).lower()
                    self.buffer = self.buffer[match.end():]
                else:
                    if final:
                        # An unfinished opening tag must never appear to the user.
                        output += re.sub(r"<(?:t(?:h(?:i(?:n(?:k)?)?)?)?|a(?:n(?:a(?:l(?:y(?:s(?:i(?:s)?)?)?)?)?)?)?)?$", "", self.buffer, flags=re.I)
                        self.buffer = ""
                    elif len(self.buffer) > 10:
                        output += self.buffer[:-10]
                        self.buffer = self.buffer[-10:]
                    break
        return output
