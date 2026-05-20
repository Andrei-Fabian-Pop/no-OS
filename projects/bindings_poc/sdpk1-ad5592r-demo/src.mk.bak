SRCS += $(PROJECT)/src/main.c
SRCS += $(PROJECT)/src/user_app.c
SRCS += $(PROJECT)/src/common/common_data.c

INCS += $(PROJECT)/src/user_app.h
INCS += $(PROJECT)/src/common/common_data.h

# AD5592R driver
INCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r.h
INCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r-base.h
SRCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r.c
SRCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r-base.c

# no-OS API
SRCS += $(DRIVERS)/api/no_os_gpio.c \
	$(DRIVERS)/api/no_os_spi.c  \
	$(DRIVERS)/api/no_os_uart.c \
	$(DRIVERS)/api/no_os_irq.c  \
	$(DRIVERS)/api/no_os_dma.c  \
	$(DRIVERS)/api/no_os_pwm.c  \
	$(NO-OS)/util/no_os_util.c  \
	$(NO-OS)/util/no_os_alloc.c \
	$(NO-OS)/util/no_os_mutex.c \
	$(NO-OS)/util/no_os_lf256fifo.c \
	$(NO-OS)/util/no_os_list.c

# STM32 platform drivers
INCS += $(PLATFORM_DRIVERS)/stm32_gpio.h       \
	$(PLATFORM_DRIVERS)/stm32_spi.h        \
	$(PLATFORM_DRIVERS)/stm32_dma.h        \
	$(PLATFORM_DRIVERS)/stm32_pwm.h        \
	$(PLATFORM_DRIVERS)/stm32_irq.h        \
	$(PLATFORM_DRIVERS)/stm32_uart.h       \
	$(PLATFORM_DRIVERS)/stm32_uart_stdio.h \
	$(PLATFORM_DRIVERS)/stm32_hal.h

SRCS += $(PLATFORM_DRIVERS)/stm32_delay.c      \
	$(PLATFORM_DRIVERS)/stm32_gpio.c       \
	$(PLATFORM_DRIVERS)/stm32_spi.c        \
	$(PLATFORM_DRIVERS)/stm32_dma.c        \
	$(PLATFORM_DRIVERS)/stm32_pwm.c        \
	$(PLATFORM_DRIVERS)/stm32_irq.c        \
	$(PLATFORM_DRIVERS)/stm32_uart.c       \
	$(PLATFORM_DRIVERS)/stm32_uart_stdio.c

# no-OS headers
INCS += $(INCLUDE)/no_os_delay.h     \
	$(INCLUDE)/no_os_error.h     \
	$(INCLUDE)/no_os_gpio.h      \
	$(INCLUDE)/no_os_spi.h       \
	$(INCLUDE)/no_os_uart.h      \
	$(INCLUDE)/no_os_irq.h       \
	$(INCLUDE)/no_os_util.h      \
	$(INCLUDE)/no_os_alloc.h     \
	$(INCLUDE)/no_os_mutex.h     \
	$(INCLUDE)/no_os_print_log.h \
	$(INCLUDE)/no_os_units.h \
	$(INCLUDE)/no_os_lf256fifo.h \
	$(INCLUDE)/no_os_dma.h \
	$(INCLUDE)/no_os_list.h \
	$(INCLUDE)/no_os_pwm.h
