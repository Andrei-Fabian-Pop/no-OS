# Auto-generated src.mk from configuration
# Platform: stm32
# Do not edit manually

# Sources
# project
SRCS += $(PROJECT)/src/main.c \
	$(PROJECT)/src/user_app.c \
	$(PROJECT)/src/common/common_data.c

# no-os-util
SRCS += $(NO-OS)/util/no_os_util.c \
	$(NO-OS)/util/no_os_alloc.c \
	$(NO-OS)/util/no_os_mutex.c \
	$(NO-OS)/util/no_os_list.c \
	$(NO-OS)/util/no_os_lf256fifo.c

# platform
SRCS += $(PLATFORM_DRIVERS)/stm32_delay.c \
	$(PLATFORM_DRIVERS)/stm32_spi.c \
	$(PLATFORM_DRIVERS)/stm32_dma.c \
	$(PLATFORM_DRIVERS)/stm32_gpio.c \
	$(PLATFORM_DRIVERS)/stm32_pwm.c \
	$(PLATFORM_DRIVERS)/stm32_i2c.c \
	$(PLATFORM_DRIVERS)/stm32_uart.c

# driver
SRCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r-base.c \
	$(DRIVERS)/adc-dac/ad5592r/ad5592r.c

# no-os-api
SRCS += $(DRIVERS)/api/no_os_spi.c \
	$(DRIVERS)/api/no_os_irq.c \
	$(DRIVERS)/api/no_os_dma.c \
	$(DRIVERS)/api/no_os_gpio.c \
	$(DRIVERS)/api/no_os_pwm.c \
	$(DRIVERS)/api/no_os_i2c.c \
	$(DRIVERS)/api/no_os_uart.c

# Includes
# project
INCS += $(PROJECT)/src/user_app.h \
	$(PROJECT)/src/common/common_data.h

# no-os
INCS += $(INCLUDE)/no_os_delay.h \
	$(INCLUDE)/no_os_error.h \
	$(INCLUDE)/no_os_util.h \
	$(INCLUDE)/no_os_alloc.h \
	$(INCLUDE)/no_os_mutex.h \
	$(INCLUDE)/no_os_list.h \
	$(INCLUDE)/no_os_lf256fifo.h \
	$(INCLUDE)/no_os_print_log.h \
	$(INCLUDE)/no_os_units.h \
	$(INCLUDE)/no_os_init.h \
	$(INCLUDE)/no_os_spi.h \
	$(INCLUDE)/no_os_dma.h \
	$(INCLUDE)/no_os_irq.h \
	$(INCLUDE)/no_os_pwm.h \
	$(INCLUDE)/no_os_gpio.h \
	$(INCLUDE)/no_os_i2c.h \
	$(INCLUDE)/no_os_uart.h

# driver
INCS += $(DRIVERS)/adc-dac/ad5592r/ad5592r-base.h \
	$(DRIVERS)/adc-dac/ad5592r/ad5592r.h

# platform
INCS += $(PLATFORM_DRIVERS)/stm32_spi.h \
	$(PLATFORM_DRIVERS)/stm32_dma.h \
	$(PLATFORM_DRIVERS)/stm32_gpio.h \
	$(PLATFORM_DRIVERS)/stm32_pwm.h \
	$(PLATFORM_DRIVERS)/stm32_i2c.h \
	$(PLATFORM_DRIVERS)/stm32_uart.h

